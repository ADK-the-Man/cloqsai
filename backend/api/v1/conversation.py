"""
Clarification dialogue and conversational discovery endpoints.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from api.deps import get_project_or_404
from models.db import Project, Conversation, Scenario
from models.schemas import (
    ConversationResponse,
    AnswerRequest,
    ConversationStatusResponse,
    ConversationMessage,
    ArchitectChatRequest,
    ArchitectChatResponse,
)
from ai.stages.clarification_engine import clarification_engine
from ai.stages.architect_chat import chat_with_architect

router = APIRouter()


@router.get("/projects/{id}/conversation", response_model=ConversationResponse)
async def get_conversation(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Conversation).where(Conversation.project_id == project.id))
    conv = res.scalar_one_or_none()
    if not conv:
        conv = Conversation(
            id=uuid.uuid4(),
            project_id=project.id,
            messages=[],
            collected_requirements={},
            questions_asked=[],
            is_complete=False,
            completeness_score=0.2,
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)

    next_q = await clarification_engine.get_questions_async(
        conv.collected_requirements or {},
        conv.questions_asked or []
    )

    score = 1.0 if conv.is_complete else (conv.completeness_score or 0.2)

    return ConversationResponse(
        id=conv.id,
        project_id=conv.project_id,
        messages=[ConversationMessage(**m) for m in (conv.messages or [])],
        collected_requirements=conv.collected_requirements or {},
        questions_asked=conv.questions_asked or [],
        is_complete=conv.is_complete,
        completeness_score=score,
        next_questions=next_q,
        updated_at=conv.updated_at,
    )


@router.post("/projects/{id}/conversation/answer", response_model=ConversationResponse)
async def answer_question(
    req: AnswerRequest,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Conversation).where(Conversation.project_id == project.id))
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = list(conv.messages or [])
    questions_asked = list(conv.questions_asked or [])
    collected = dict(conv.collected_requirements or {})

    # Record question as asked
    if req.question_id not in questions_asked:
        questions_asked.append(req.question_id)

    # Append user answer message
    user_msg = {
        "role": "user",
        "content": "Skipped / I don't know" if req.is_skipped else req.answer,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "question_id": req.question_id,
    }
    messages.append(user_msg)

    if not req.is_skipped:
        collected[req.question_id] = req.answer

    # Compute updated completeness
    new_score = clarification_engine.calculate_completeness(collected)
    conv.completeness_score = new_score
    conv.collected_requirements = collected
    conv.questions_asked = questions_asked

    # Check completion condition: >= 75% or 3 questions answered
    if new_score >= 0.75 or len(questions_asked) >= 3:
        conv.is_complete = True
        conv.completeness_score = 1.0
        project.status = "clarification_complete"
        agent_msg = {
            "role": "agent",
            "content": "Thank you! I have sufficient clarity on your workload specifications. You can now proceed to review the generated architecture diagram.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question_id": None
        }
    else:
        conv.is_complete = False
        agent_msg = {
            "role": "agent",
            "content": "Got it. Let me refine the sizing parameters with this additional context.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question_id": None
        }
    messages.append(agent_msg)
    conv.messages = messages
    conv.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(conv)

    next_q = [] if conv.is_complete else await clarification_engine.get_questions_async(collected, questions_asked)

    return ConversationResponse(
        id=conv.id,
        project_id=conv.project_id,
        messages=[ConversationMessage(**m) for m in messages],
        collected_requirements=conv.collected_requirements,
        questions_asked=conv.questions_asked,
        is_complete=conv.is_complete,
        completeness_score=conv.completeness_score,
        next_questions=next_q,
        updated_at=conv.updated_at,
    )


@router.get("/projects/{id}/conversation/status", response_model=ConversationStatusResponse)
async def get_conversation_status(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Conversation).where(Conversation.project_id == project.id))
    conv = res.scalar_one_or_none()
    if not conv:
        return ConversationStatusResponse(is_complete=False, completeness_score=0.0, questions_remaining_estimate=3)

    remaining = max(0, 3 - len(conv.questions_asked or []))
    return ConversationStatusResponse(
        is_complete=conv.is_complete,
        completeness_score=conv.completeness_score,
        questions_remaining_estimate=0 if conv.is_complete else remaining,
    )


@router.post("/projects/{id}/conversation/chat", response_model=ArchitectChatResponse)
async def chat_with_principal_architect(
    req: ArchitectChatRequest,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    """
    Real-time interactive chat with the AI Principal Cloud Architect.
    Understands current architecture, diagram, resources, and pricing.
    Can answer technical trade-off questions and propose 1-click architecture prompt mutations.
    """
    # 1. Fetch recommended scenario resources for context
    scen_res = await db.execute(
        select(Scenario)
        .where(Scenario.project_id == project.id, Scenario.scenario_type == "recommended")
    )
    scenario = scen_res.scalars().first()
    resources = scenario.resources if scenario else []
    monthly_cost = scenario.monthly_cost_usd if scenario else (project.monthly_cost_estimate or 0.0)

    # 2. Fetch conversation record to record chat messages
    conv_res = await db.execute(select(Conversation).where(Conversation.project_id == project.id))
    conv = conv_res.scalar_one_or_none()

    prompt = project.description or (conv.collected_requirements.get("raw_text") if conv and conv.collected_requirements else "")

    # 3. Call Architect Chat Engine
    response = await chat_with_architect(
        user_msg=req.message,
        history=req.history,
        raw_prompt=prompt,
        resources=resources,
        monthly_cost=monthly_cost,
    )

    # 4. Save messages to conversation history if conversation exists
    if conv:
        messages = list(conv.messages or [])
        messages.append({
            "role": "user",
            "content": req.message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question_id": None
        })
        messages.append({
            "role": "assistant",
            "content": response.reply,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question_id": None
        })
        conv.messages = messages
        conv.updated_at = datetime.now(timezone.utc)
        await db.commit()

    return response
