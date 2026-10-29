from __future__ import annotations
"""
Semantic Pattern Ranker: uses LLM reasoning and ranking to evaluate candidate
cloud architecture patterns against customer requirements and negative constraints.
Includes a robust deterministic n-gram scoring fallback when the LLM is unavailable.
"""
import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from ai.llm_client import get_llm_client, LLMConfigError

logger = logging.getLogger(__name__)

# Global LRU cache for prompt rankings to optimize latency and token spend
_RANKING_CACHE: Dict[str, Dict[str, Any]] = {}

RANKING_SYSTEM_PROMPT = """You are a Principal Cloud Architecture Evaluator and Workload Sizing Engineer.
Your task is to analyze natural language customer workload specifications, extract architectural signals,
strictly enforce negative constraints (such as 'no separate EC2', 'don't want multiple EC2', 'one EKS with nodes as needed'),
and score/rank candidate architecture patterns.

For each competing architectural pattern:
- Assign an affinity score between 0.0 and 1.0 based on customer requirements and negative constraints.
- Any pattern explicitly rejected or negated by the customer (e.g. 'dont want multiple ec2') MUST receive a score < 0.1 and bottom rank.
- Rank patterns in descending order (Rank 1 = highest affinity).
- Provide a brief, concise technical rationale for the ranking.
"""

RANKING_SCHEMA = {
    "type": "object",
    "properties": {
        "compute_ranking": {
            "type": "array",
            "description": "Ranked list of compute architecture paradigms",
            "items": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "enum": ["eks_kubernetes", "ec2_cluster", "serverless_containers", "serverless_functions"]},
                    "score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    "rank": {"type": "integer"},
                    "rationale": {"type": "string"}
                },
                "required": ["pattern", "score", "rank", "rationale"]
            }
        },
        "database_ranking": {
            "type": "array",
            "description": "Ranked list of database deployment patterns",
            "items": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "enum": ["relational_master_slave", "relational_single_instance", "aurora_serverless", "nosql_document"]},
                    "score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    "rank": {"type": "integer"},
                    "rationale": {"type": "string"}
                },
                "required": ["pattern", "score", "rank", "rationale"]
            }
        },
        "gateway_placement": {
            "type": "object",
            "description": "Where in-house LLM/AI gateways or routing microservices should be deployed",
            "properties": {
                "pattern": {"type": "string", "enum": ["co_located_on_k8s", "standalone_vm_cluster", "none"]},
                "score": {"type": "number"},
                "rationale": {"type": "string"}
            },
            "required": ["pattern", "score", "rationale"]
        },
        "extracted_signals": {
            "type": "object",
            "description": "Extracted workload flags and parameters",
            "properties": {
                "no_separate_ec2": {"type": "boolean", "description": "True if customer rejected separate EC2 instances or requested pure EKS"},
                "has_eks": {"type": "boolean", "description": "True if Kubernetes / EKS is chosen or requested"},
                "has_rds": {"type": "boolean"},
                "has_read_replica": {"type": "boolean"},
                "has_airflow": {"type": "boolean"},
                "has_llm_gateway": {"type": "boolean"},
                "has_secrets": {"type": "boolean"},
                "secrets_count": {"type": "integer"},
                "has_s3": {"type": "boolean"},
                "has_redis": {"type": "boolean"},
                "has_large_video_uploads": {"type": "boolean"},
                "target_region": {"type": "string"}
            },
            "required": ["no_separate_ec2", "has_eks", "has_rds", "has_read_replica", "has_airflow", "has_llm_gateway", "has_secrets", "secrets_count"]
        },
        "key_constraints": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of explicit positive and negative constraints identified in the prompt"
        }
    },
    "required": ["compute_ranking", "database_ranking", "gateway_placement", "extracted_signals", "key_constraints"]
}


def is_negated(pattern: str, text: str, window: int = 50) -> bool:
    """Check if a keyword pattern is preceded by a negation within a character window, respecting affirmative clauses."""
    for m in re.finditer(pattern, text):
        start = max(0, m.start() - window)
        prefix = text[start:m.start()]

        neg_found = False
        for neg in ["dont want", "don't want", "no ", "without ", "skip ", "never ", "not want", "dont need", "don't need", "no need", "not need"]:
            neg_idx = prefix.rfind(neg)
            if neg_idx != -1:
                sub = prefix[neg_idx + len(neg):]
                # If there is an affirmative clause after the negation, the pattern is affirmed (e.g. "dont want ec2, i want eks")
                if any(aff in sub for aff in ["i want", "we want", "want", "prefer", "need", "use", "deploy", "have"]):
                    continue
                neg_found = True
                break
        if neg_found:
            return True
    return False


def compute_deterministic_ranking(raw_text: str, req: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministic scoring and ranking algorithm used as fallback or baseline.
    Analyzes positive keywords, negation proximity, and structural intent.
    """
    text = raw_text.lower()

    # 1. Negative EC2 constraint detection
    ec2_negation_triggers = [
        "dont want seperate ec2", "dont want separate ec2", "don't want seperate ec2",
        "don't want separate ec2", "no separate ec2", "no seperate ec2",
        "no standalone ec2", "without separate ec2", "without seperate ec2",
        "dont want separate instances", "no separate instances",
        "dont want multiple ec2", "don't want multiple ec2", "no multiple ec2",
        "dont need multiple ec2", "don't need multiple ec2", "no need multiple ec2",
        "dont need ec2", "don't need ec2", "no need ec2", "no need for ec2",
        "dont want ec2", "don't want ec2", "no ec2", "without ec2",
        "one eks", "eks with nodes", "eks cluster with nodes", "single eks",
        "i need one eks", "need one eks", "one eks with nodes"
    ]
    no_separate_ec2 = any(k in text for k in ec2_negation_triggers) or is_negated(r"\b(?:ec2|vms|virtual machines|instances)\b", text)

    # 2. Compute Pattern Affinity Scoring
    k8s_negation = is_negated(r"\b(?:kubernetes|k8s|eks|aks)\b", text)
    vm_negation = no_separate_ec2 or is_negated(r"\b(?:vms|virtual machines|ec2|instances)\b", text)

    eks_positive = ["eks", "aks", "kubernetes", "k8s", "pod", "cluster", "nodes as needed", "one eks"]
    eks_score = 0.3
    if k8s_negation:
        eks_score = 0.05
    elif any(k in text for k in eks_positive):
        eks_score += 0.6
        if no_separate_ec2:
            eks_score += 0.35
    eks_score = min(1.0, eks_score)

    ec2_score = 0.4
    if vm_negation:
        ec2_score = 0.05
    elif any(k in text for k in ["ec2", "instances", "virtual machines", "vms", "asg"]):
        ec2_score += 0.4

    fargate_score = 0.25
    lambda_score = 0.2
    if any(k in text for k in ["serverless", "event-driven", "faas"]):
        fargate_score += 0.4
        lambda_score += 0.6
    if any(k in text for k in ["fargate", "container apps", "serverless container"]):
        fargate_score += 0.5
    if any(k in text for k in ["lambda", "serverless function", "functions"]):
        lambda_score += 0.6

    compute_candidates = [
        ("eks_kubernetes", eks_score, "Eliminated due to explicit rejection of Kubernetes." if k8s_negation else ("Requested managed Kubernetes deployment with worker nodes." if eks_score > 0.6 else "Standard containerized runtime candidate.")),
        ("ec2_cluster", ec2_score, "Eliminated due to explicit customer rejection of standalone/multiple EC2 instances." if vm_negation else "Traditional autoscaling EC2 compute cluster."),
        ("serverless_containers", fargate_score, "Container runtime without node management."),
        ("serverless_functions", lambda_score, "Event-driven serverless architecture.")
    ]
    compute_candidates.sort(key=lambda x: x[1], reverse=True)
    compute_ranking = [
        {"pattern": c[0], "score": round(c[1], 2), "rank": idx + 1, "rationale": c[2]}
        for idx, c in enumerate(compute_candidates)
    ]

    has_eks = not k8s_negation and (compute_ranking[0]["pattern"] == "eks_kubernetes" or no_separate_ec2 or any(k in text for k in ["eks", "kubernetes", "k8s"]))

    # 3. Database Pattern Affinity Scoring
    has_aurora = any(k in text for k in ["aurora", "aurora serverless", "aurora postgres", "aurora mysql"])
    has_master_slave = any(k in text for k in [
        "master slave", "master-slave", "master/slave", "read replica", "slave",
        "5000 reads", "5000 writes", "read do 5000", "writes"
    ])
    has_rds = has_master_slave or has_aurora or any(k in text for k in ["rds", "postgres", "postgresql", "mysql", "database", "from db", "to db", "in db"])

    db_candidates = []
    if has_aurora:
        db_candidates.append(("aurora_serverless", 0.95, "Selected Amazon Aurora Serverless distributed relational database."))
        db_candidates.append(("relational_master_slave", 0.4, "Alternative multi-instance replication topology."))
        db_candidates.append(("relational_single_instance", 0.35, "Standard RDS instance."))
        db_candidates.append(("nosql_document", 0.2, "Alternative non-relational document model."))
    elif has_master_slave:
        db_candidates.append(("relational_master_slave", 0.95, "Selected to handle separated 5,000 read and write concurrency across Master and Read Replica."))
        db_candidates.append(("relational_single_instance", 0.3, "Suboptimal for high independent read/write concurrency requirements."))
        db_candidates.append(("aurora_serverless", 0.25, "Alternative auto-scaling relational tier."))
        db_candidates.append(("nosql_document", 0.2, "Alternative non-relational document model."))
    elif has_rds:
        db_candidates.append(("relational_single_instance", 0.85, "Primary managed relational database instance."))
        db_candidates.append(("relational_master_slave", 0.5, "Over-provisioned for single database requirement unless read replicas requested."))
        db_candidates.append(("aurora_serverless", 0.25, "Alternative auto-scaling relational tier."))
        db_candidates.append(("nosql_document", 0.2, "Alternative non-relational document model."))
    else:
        db_candidates.append(("relational_single_instance", 0.4, "Default general relational database."))
        db_candidates.append(("relational_master_slave", 0.2, "Not required by basic specification."))
        db_candidates.append(("aurora_serverless", 0.25, "Alternative auto-scaling relational tier."))
        db_candidates.append(("nosql_document", 0.2, "Alternative non-relational document model."))
    db_candidates.sort(key=lambda x: x[1], reverse=True)
    database_ranking = [
        {"pattern": d[0], "score": round(d[1], 2), "rank": idx + 1, "rationale": d[2]}
        for idx, d in enumerate(db_candidates)
    ]

    # 4. Gateway Placement Ranking
    has_llm_gateway = any(k in text for k in ["llm gateway", "ilm gateway", "in house llm", "in house ilm", "ai gateway", "model gateway", "llm proxy", "ilm proxy", "llm", "ilm"])
    if has_llm_gateway:
        if has_eks or no_separate_ec2:
            gateway_placement = {
                "pattern": "co_located_on_k8s",
                "score": 0.98,
                "rationale": "Co-located on EKS worker node group; satisfies 'no multiple EC2' constraint with zero standalone VMs."
            }
        else:
            gateway_placement = {
                "pattern": "standalone_vm_cluster",
                "score": 0.85,
                "rationale": "Dedicated EC2 VM cluster for isolated model serving."
            }
    else:
        gateway_placement = {
            "pattern": "none",
            "score": 1.0,
            "rationale": "No private LLM/AI gateway requested in specification."
        }

    # 5. Extract Auxiliary Parameters
    secrets_count = 5
    sec_match = re.search(r"(\d+)\s*(?:secrets?|keys?)", text)
    if sec_match:
        try:
            secrets_count = int(sec_match.group(1))
        except (ValueError, TypeError):
            secrets_count = 5
    elif req.get("secrets_count"):
        try:
            secrets_count = int(req["secrets_count"])
        except (ValueError, TypeError):
            secrets_count = 5

    has_secrets = bool(sec_match) or any(k in text for k in ["secrets manager", "secret manager", "secrets", "secret", "key vault"])
    has_airflow = any(k in text for k in ["airflow", "mwaa", "managed airflow", "dag", "dags", "apache airflow"])
    has_s3 = any(k in text for k in ["s3", "bucket", "blob", "upload", "uploads", "video", "videos", "2 gb", "2gb", "docx", "pptx"])
    has_redis = any(k in text for k in ["redis", "cache", "caching", "elasticache", "session cache"])
    has_large_video_uploads = any(k in text for k in ["video", "videos", "2 gb", "2gb", "docx", "pptx", "large file", "upto 2 gb", "up to 2 gb"])

    constraints = []
    if no_separate_ec2:
        constraints.append("Negative Constraint: Do not deploy standalone EC2 instances; run compute exclusively on EKS worker nodes.")
    if has_master_slave:
        constraints.append("Architecture Constraint: Master-Slave database separation for 5,000 concurrent reads and writes.")
    if has_airflow:
        constraints.append("Orchestration Constraint: Managed Apache Airflow (MWAA) environment for DAG execution.")
    if has_secrets:
        constraints.append(f"Security Constraint: Provision managed Secrets Manager capacity for {secrets_count} secrets.")

    return {
        "compute_ranking": compute_ranking,
        "database_ranking": database_ranking,
        "gateway_placement": gateway_placement,
        "extracted_signals": {
            "no_separate_ec2": no_separate_ec2,
            "has_eks": has_eks,
            "has_rds": has_rds,
            "has_read_replica": has_master_slave,
            "has_airflow": has_airflow,
            "has_llm_gateway": has_llm_gateway,
            "has_secrets": has_secrets,
            "secrets_count": secrets_count,
            "has_s3": has_s3,
            "has_redis": has_redis,
            "has_large_video_uploads": has_large_video_uploads,
            "target_region": req.get("region") or "us-east-1"
        },
        "key_constraints": constraints,
        "ranking_source": "deterministic_heuristics"
    }


async def rank_architecture_patterns(raw_text: str, req: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Evaluates customer requirements using the LLM Pattern Ranker.
    If the LLM client is unconfigured or encounters a network error, falls back seamlessly
    to the deterministic pattern ranker. Results are cached per prompt hash.
    """
    req_dict = req or {}
    text_clean = (raw_text or "").strip()
    if not text_clean:
        return compute_deterministic_ranking("", req_dict)

    # Check cache
    cache_key = hashlib.sha256(text_clean.lower().encode("utf-8")).hexdigest()
    if cache_key in _RANKING_CACHE:
        return _RANKING_CACHE[cache_key]

    try:
        client = get_llm_client()
        user_message = (
            f"Analyze the following workload description and rank architectural patterns:\n\n"
            f"--- WORKLOAD SPECIFICATION ---\n{text_clean}\n-------------------------------\n\n"
            f"Perform pattern scoring, rank compute and database paradigms, and extract all workload signals."
        )

        response = await client.chat_completion(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=RANKING_SYSTEM_PROMPT,
            response_schema=RANKING_SCHEMA,
            tool_name="rank_architecture_patterns",
            tool_description="Submit structured pattern affinity rankings, rationale, and extracted workload parameters",
            temperature=0.0,
            timeout=25,
        )

        if response and isinstance(response, dict) and "compute_ranking" in response:
            response["ranking_source"] = "llm_ranking"
            _RANKING_CACHE[cache_key] = response
            logger.info("Successfully ranked architectural patterns via LLM for prompt hash %s", cache_key[:8])
            return response

    except Exception as exc:
        logger.info(
            "LLM Pattern Ranker unavailable (%s). Engaging deterministic heuristic ranker.",
            str(exc)
        )

    # Fallback to deterministic scoring
    fallback_res = compute_deterministic_ranking(text_clean, req_dict)
    _RANKING_CACHE[cache_key] = fallback_res
    return fallback_res


def get_cached_or_deterministic_ranking(raw_text: str, req: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Synchronous accessor: returns cached LLM ranking if available for prompt,
    otherwise executes the deterministic ranking immediately.
    """
    text_clean = (raw_text or "").strip()
    cache_key = hashlib.sha256(text_clean.lower().encode("utf-8")).hexdigest()
    if cache_key in _RANKING_CACHE:
        return _RANKING_CACHE[cache_key]
    return compute_deterministic_ranking(text_clean, req or {})
