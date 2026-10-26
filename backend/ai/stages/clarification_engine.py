from __future__ import annotations
"""
LLM-Driven Clarification Engine:
Uses the LLM to generate intelligent, dynamic, context-specific clarification questions
based on what the user described, avoiding hardcoded or pre-fixed questions.
"""
import logging
import uuid
from typing import Any, Dict, List, Optional
from ai.llm_client import get_llm_client
from models.schemas import ClarificationQuestion, ClarificationOption

logger = logging.getLogger(__name__)

CLARIFICATION_SYSTEM_PROMPT = """You are a Principal Cloud Solutions Architect interviewing a customer about their cloud application requirements.
Analyze their application description and collected requirements.
Generate 2 to 3 intelligent, highly specific technical clarification questions that directly impact infrastructure sizing, cloud service selection, high availability, or cost.

CRITICAL RULES:
1. Do NOT ask generic or repetitive questions.
2. Ask questions directly tailored strictly to the specific technologies, node counts, storage, or tools the customer mentioned.
3. If the customer did NOT mention or request a relational database / RDS, do NOT ask about RDS or database instance types. Only ask database questions if a database was explicitly mentioned.
4. For each question, provide 3 to 4 realistic technical options with clear explanations of trade-offs.
5. Do NOT ask questions that the user has already answered or that are already in 'already_asked_ids'.
"""

CLARIFICATION_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Unique short identifier like eks_node_type, opensearch_storage, etc."},
                    "field_key": {"type": "string", "description": "Field key this informs"},
                    "text": {"type": "string", "description": "The clear technical question to ask the user"},
                    "explanation": {"type": "string", "description": "Why this decision matters for architecture or cost"},
                    "question_type": {"type": "string", "enum": ["multiple_choice", "free_text"], "default": "multiple_choice"},
                    "options": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "label": {"type": "string"}
                            },
                            "required": ["value", "label"]
                        }
                    }
                },
                "required": ["id", "field_key", "text", "explanation", "options"]
            }
        }
    },
    "required": ["questions"]
}


class ClarificationEngine:
    async def get_questions_async(
        self,
        collected_requirements: Dict[str, Any],
        already_asked_ids: List[str]
    ) -> List[ClarificationQuestion]:
        raw_text = collected_requirements.get("raw_text") or str(collected_requirements)

        # 1. Attempt LLM generation
        try:
            client = get_llm_client()
            prompt = f"Customer workload description and extracted requirements:\n{raw_text}\n\nAlready asked questions: {already_asked_ids}\n\nGenerate 2-3 new, context-aware clarification questions."
            res = await client.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                system_prompt=CLARIFICATION_SYSTEM_PROMPT,
                response_schema=CLARIFICATION_SCHEMA,
                tool_name="generate_clarification_questions",
                tool_description="Generate context-specific technical questions for the customer"
            )
            raw_qs = res.get("questions", [])
            if isinstance(raw_qs, str):
                import json
                try:
                    raw_qs = json.loads(raw_qs)
                except Exception:
                    raw_qs = []

            questions = []
            for q in raw_qs:
                if not isinstance(q, dict):
                    continue
                qid = q.get("id") or str(uuid.uuid4())[:8]
                if qid not in already_asked_ids:
                    opts = []
                    for opt in q.get("options", []):
                        if isinstance(opt, dict):
                            opts.append(ClarificationOption(value=str(opt.get("value", "")), label=str(opt.get("label", ""))))
                        elif isinstance(opt, str):
                            opts.append(ClarificationOption(value=opt.lower().replace(" ", "_"), label=opt))
                    if opts:
                        questions.append(ClarificationQuestion(
                            id=qid,
                            field_key=q.get("field_key", qid),
                            text=q.get("text", ""),
                            explanation=q.get("explanation", ""),
                            question_type=q.get("question_type", "multiple_choice"),
                            options=opts
                        ))
            if questions:
                return questions[:3]
        except Exception as e:
            logger.warning("LLM dynamic question generation failed: %s. Using contextual fallback.", e)

        # 2. Contextual fallback if LLM is unavailable
        from ai.stages.sizing_engine import parse_workload_signals
        sig = parse_workload_signals(collected_requirements)
        candidates = []

        if sig["has_eks"] and "eks_autoscaling" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="eks_autoscaling",
                field_key="eks_autoscaling",
                text="For your EKS cluster with 2 Linux nodes and 4 pods, what auto-scaling strategy will you use?",
                explanation="Scaling 4 pods (from 500Mi rest to 2Gi under processing) requires adequate buffer capacity to avoid node memory exhaustion and pod evictions.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="karpenter", label="Karpenter Just-in-Time Auto-Provisioning (Recommended for bursty workloads)"),
                    ClarificationOption(value="cluster_autoscaler", label="Standard AWS Managed Node Groups + Cluster Autoscaler"),
                    ClarificationOption(value="fixed_capacity", label="Fixed 2-node capacity with HPA pod limits only"),
                ]
            ))

        if sig["has_opensearch"] and "opensearch_ha" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="opensearch_ha",
                field_key="opensearch_ha",
                text="What is your required deployment topology for the OpenSearch domain?",
                explanation="OpenSearch domains with dedicated master nodes and multi-AZ replica shards prevent split-brain issues and ensure search availability during host upgrades.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="single_az", label="Single-AZ (1 Data Node, lowest cost, for dev/test)"),
                    ClarificationOption(value="multi_az_standby", label="Multi-AZ (2 Data Nodes, 1 Replica Shard, production standard)"),
                    ClarificationOption(value="dedicated_masters", label="Multi-AZ with 3 Dedicated Master Nodes (High availability & heavy search load)"),
                ]
            ))

        if (sig["has_sqs"] or sig["has_lambda"]) and "sqs_throughput" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="sqs_throughput",
                field_key="sqs_throughput",
                text="What is the expected message volume between SQS and your Lambda background worker?",
                explanation="Determines Lambda concurrency limits, SQS polling frequency, and whether batching is required to optimize compute cost.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="low", label="Low volume (< 50,000 messages/day)"),
                    ClarificationOption(value="moderate", label="Moderate volume (~500,000 messages/day with standard batching)"),
                    ClarificationOption(value="high", label="High volume (1M+ messages/day with reserved Lambda concurrency)"),
                ]
            ))

        if sig.get("has_redis") and "redis_caching" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="redis_caching",
                field_key="redis_caching",
                text="What caching topology and eviction strategy should be configured for Redis?",
                explanation="Multi-AZ replication provides zero-downtime failover for critical session caches and rate limiters.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="cluster_multi_az", label="Multi-AZ with Automatic Failover (Production standard with 2+ replicas)"),
                    ClarificationOption(value="single_node", label="Single Node Cache (Cost-optimized for non-critical transient caching)"),
                    ClarificationOption(value="read_replica_cluster", label="Clustered Redis with 3 Read Replicas (High read-throughput)"),
                ]
            ))

        if sig["has_rds"] and "db_ha_topology" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="db_ha_topology",
                field_key="db_ha_topology",
                text="What is your required database redundancy and failover policy?",
                explanation="Multi-AZ standby deployments replicate synchronously to a second availability zone to meet strict 99.9% RTO/RPO SLAs.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="multi_az_standby", label="Multi-AZ Standby Deployment (Automated failover in under 60 seconds)"),
                    ClarificationOption(value="single_az", label="Single-AZ Deployment (Lower cost, best for development or non-critical DBs)"),
                    ClarificationOption(value="multi_az_read_replica", label="Multi-AZ + 1 Read Replica (High read concurrency)"),
                ]
            ))

        if sig["has_s3"] and "s3_lifecycle" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="s3_lifecycle",
                field_key="s3_lifecycle",
                text=f"For your {sig['s3_count']} S3 buckets, should automatic lifecycle transitions to Glacier be configured?",
                explanation="Transitioning non-current versions and archive files after 90 days reduces long-term storage costs by up to 70%.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="standard_only", label="Standard S3 Frequent Access only (All objects immediate access)"),
                    ClarificationOption(value="intelligent_tiering", label="S3 Intelligent-Tiering (Auto-optimizes cost based on access patterns)"),
                    ClarificationOption(value="glacier_archive", label="Standard + Glacier Deep Archive policy after 90 days"),
                ]
            ))

        if sig.get("has_airflow") and "airflow_scaling" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="airflow_scaling",
                field_key="airflow_scaling",
                text="What is the expected execution frequency and worker concurrency for your Airflow DAGs?",
                explanation="Managed Airflow (MWAA/ADF) worker sizing depends on the maximum number of concurrent tasks and task queue depth.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="hourly_batch", label="Scheduled Hourly/Daily Batches (1-2 Celery workers with auto-scaling)"),
                    ClarificationOption(value="continuous_pipeline", label="Continuous High-Frequency DAGs (4+ workers with Celery executor)"),
                    ClarificationOption(value="burstable_dags", label="Burstable Workloads with Task Spikes (Autoscaling from 1 to 10 workers)"),
                ]
            ))

        if sig.get("has_llm_gateway") and "llm_gateway_caching" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="llm_gateway_caching",
                field_key="llm_gateway_caching",
                text="Should the In-House LLM Gateway incorporate semantic caching for prompt responses?",
                explanation="Semantic response caching for LLM responses can reduce inference latency from 30s to <100ms and significantly cut token costs.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="semantic_cache", label="Yes, enable Redis semantic caching for repeated prompt completions"),
                    ClarificationOption(value="direct_passthrough", label="Direct passthrough without response caching (always live inference)"),
                    ClarificationOption(value="in_memory_lru", label="Local in-memory LRU cache on gateway instances"),
                ]
            ))

        return [c for c in candidates if c.id not in already_asked_ids][:3]

    def get_questions(
        self,
        collected_requirements: Dict[str, Any],
        already_asked_ids: List[str]
    ) -> List[ClarificationQuestion]:
        # Synchronous interface compatibility
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # In async loop, use contextual fallback directly to avoid nested loop blocking
                pass
        except Exception:
            pass

        from ai.stages.sizing_engine import parse_workload_signals
        sig = parse_workload_signals(collected_requirements)
        candidates = []

        if sig["has_eks"] and "eks_autoscaling" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="eks_autoscaling",
                field_key="eks_autoscaling",
                text="For your EKS cluster with 2 Linux nodes and 4 pods, what auto-scaling strategy will you use?",
                explanation="Scaling 4 pods (from 500Mi rest to 2Gi under processing) requires adequate buffer capacity to avoid node memory exhaustion and pod evictions.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="karpenter", label="Karpenter Just-in-Time Auto-Provisioning (Recommended for bursty workloads)"),
                    ClarificationOption(value="cluster_autoscaler", label="Standard AWS Managed Node Groups + Cluster Autoscaler"),
                    ClarificationOption(value="fixed_capacity", label="Fixed 2-node capacity with HPA pod limits only"),
                ]
            ))

        if sig["has_opensearch"] and "opensearch_ha" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="opensearch_ha",
                field_key="opensearch_ha",
                text="What is your required deployment topology for the OpenSearch domain?",
                explanation="OpenSearch domains with dedicated master nodes and multi-AZ replica shards prevent split-brain issues and ensure search availability during host upgrades.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="single_az", label="Single-AZ (1 Data Node, lowest cost, for dev/test)"),
                    ClarificationOption(value="multi_az_standby", label="Multi-AZ (2 Data Nodes, 1 Replica Shard, production standard)"),
                    ClarificationOption(value="dedicated_masters", label="Multi-AZ with 3 Dedicated Master Nodes (High availability & heavy search load)"),
                ]
            ))

        if (sig["has_sqs"] or sig["has_lambda"]) and "sqs_throughput" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="sqs_throughput",
                field_key="sqs_throughput",
                text="What is the expected message volume between SQS and your Lambda background worker?",
                explanation="Determines Lambda concurrency limits, SQS polling frequency, and whether batching is required to optimize compute cost.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="low", label="Low volume (< 50,000 messages/day)"),
                    ClarificationOption(value="moderate", label="Moderate volume (~500,000 messages/day with standard batching)"),
                    ClarificationOption(value="high", label="High volume (1M+ messages/day with reserved Lambda concurrency)"),
                ]
            ))

        if sig.get("has_redis") and "redis_caching" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="redis_caching",
                field_key="redis_caching",
                text="What caching topology and eviction strategy should be configured for Redis?",
                explanation="Multi-AZ replication provides zero-downtime failover for critical session caches and rate limiters.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="cluster_multi_az", label="Multi-AZ with Automatic Failover (Production standard with 2+ replicas)"),
                    ClarificationOption(value="single_node", label="Single Node Cache (Cost-optimized for non-critical transient caching)"),
                    ClarificationOption(value="read_replica_cluster", label="Clustered Redis with 3 Read Replicas (High read-throughput)"),
                ]
            ))

        if sig["has_rds"] and "db_ha_topology" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="db_ha_topology",
                field_key="db_ha_topology",
                text="What is your required database redundancy and failover policy?",
                explanation="Multi-AZ standby deployments replicate synchronously to a second availability zone to meet strict 99.9% RTO/RPO SLAs.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="multi_az_standby", label="Multi-AZ Standby Deployment (Automated failover in under 60 seconds)"),
                    ClarificationOption(value="single_az", label="Single-AZ Deployment (Lower cost, best for development or non-critical DBs)"),
                    ClarificationOption(value="multi_az_read_replica", label="Multi-AZ + 1 Read Replica (High read concurrency)"),
                ]
            ))

        if sig["has_s3"] and "s3_lifecycle" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="s3_lifecycle",
                field_key="s3_lifecycle",
                text=f"For your {sig['s3_count']} S3 buckets, should automatic lifecycle transitions to Glacier be configured?",
                explanation="Transitioning non-current versions and archive files after 90 days reduces long-term storage costs by up to 70%.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="standard_only", label="Standard S3 Frequent Access only (All objects immediate access)"),
                    ClarificationOption(value="intelligent_tiering", label="S3 Intelligent-Tiering (Auto-optimizes cost based on access patterns)"),
                    ClarificationOption(value="glacier_archive", label="Standard + Glacier Deep Archive policy after 90 days"),
                ]
            ))

        if sig.get("has_airflow") and "airflow_scaling" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="airflow_scaling",
                field_key="airflow_scaling",
                text="What is the expected execution frequency and worker concurrency for your Airflow DAGs?",
                explanation="Managed Airflow (MWAA/ADF) worker sizing depends on the maximum number of concurrent tasks and task queue depth.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="hourly_batch", label="Scheduled Hourly/Daily Batches (1-2 Celery workers with auto-scaling)"),
                    ClarificationOption(value="continuous_pipeline", label="Continuous High-Frequency DAGs (4+ workers with Celery executor)"),
                    ClarificationOption(value="burstable_dags", label="Burstable Workloads with Task Spikes (Autoscaling from 1 to 10 workers)"),
                ]
            ))

        if sig.get("has_llm_gateway") and "llm_gateway_caching" not in already_asked_ids:
            candidates.append(ClarificationQuestion(
                id="llm_gateway_caching",
                field_key="llm_gateway_caching",
                text="Should the In-House LLM Gateway incorporate semantic caching for prompt responses?",
                explanation="Semantic response caching for LLM responses can reduce inference latency from 30s to <100ms and significantly cut token costs.",
                question_type="multiple_choice",
                options=[
                    ClarificationOption(value="semantic_cache", label="Yes, enable Redis semantic caching for repeated prompt completions"),
                    ClarificationOption(value="direct_passthrough", label="Direct passthrough without response caching (always live inference)"),
                    ClarificationOption(value="in_memory_lru", label="Local in-memory LRU cache on gateway instances"),
                ]
            ))

        return [c for c in candidates if c.id not in already_asked_ids][:3]

    def calculate_completeness(self, collected: Dict[str, Any]) -> float:
        tracked_keys = ["application_type", "concurrent_users", "peak_rps", "db_engine"]
        from ai.stages.sizing_engine import parse_workload_signals
        sig = parse_workload_signals(collected)
        if sig["has_eks"]:
            tracked_keys.append("eks_autoscaling")
        if sig["has_opensearch"]:
            tracked_keys.append("opensearch_ha")
        if sig["has_sqs"] or sig["has_lambda"]:
            tracked_keys.append("sqs_throughput")

        present = sum(1 for k in tracked_keys if collected.get(k) and collected.get(k) != "unknown")
        score = round(present / max(1, len(tracked_keys)), 2)
        return min(max(score, 0.3), 1.0)


clarification_engine = ClarificationEngine()
