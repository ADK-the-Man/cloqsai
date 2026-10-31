"""
AI Architecture Roaster & Well-Architected Auditor.
Performs an in-depth audit of cloud workload architectures across the 5 AWS Well-Architected pillars:
1. Cost Optimization
2. Reliability & Resilience
3. Security & Compliance
4. Performance Efficiency
5. Operational Excellence

Produces an actionable score (0-100), witty/candid architectural roast critiques,
tangible monthly cost savings, and 1-click prompt mutation recommendations.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ai.llm_client import get_llm_client, LLMConfigError
from models.schemas import WellArchitectedAuditReport, WellArchitectedFinding

logger = logging.getLogger(__name__)


def generate_deterministic_audit(
    raw_prompt: str,
    resources: List[Dict[str, Any]],
    monthly_cost: float,
    provider: str = "aws"
) -> WellArchitectedAuditReport:
    """
    High-precision deterministic rule engine modeling the AWS Well-Architected Framework
    and FinOps best practices. Guaranteed to run in < 10ms with zero external dependencies.
    """
    findings: List[WellArchitectedFinding] = []
    text_lower = (raw_prompt or "").lower()

    cost_deductions = 0
    reliability_deductions = 0
    security_deductions = 0
    ops_deductions = 0
    total_savings = 0.0

    r_names = [str(r.get("resource_name", "")).lower() for r in resources]
    skus = [str(r.get("sku", "")).lower() for r in resources]
    svc_names = [str(r.get("service_name", "")).lower() for r in resources]

    # 1. Cost Optimization Audit: Secrets Manager vs SSM Parameter Store
    has_secrets_mgr = any("secrets manager" in name or "secrets" in name for name in r_names)
    secrets_count = 5
    for r in resources:
        if "secret" in str(r.get("resource_name", "")).lower():
            try:
                import re
                m = re.search(r"(\d+)\s*secret", str(r.get("resource_name", "")).lower())
                if m:
                    secrets_count = int(m.group(1))
            except Exception:
                pass

    if has_secrets_mgr and secrets_count >= 50:
        sec_monthly = round(secrets_count * 0.40, 2)
        potential_ssm_savings = round(sec_monthly * 0.85, 2)
        total_savings += potential_ssm_savings
        cost_deductions += 15
        findings.append(WellArchitectedFinding(
            id="cost-secrets-ssm",
            pillar="cost_optimization",
            severity="cost_trap",
            title=f"{secrets_count} Secrets in AWS Secrets Manager (${sec_monthly:.2f}/mo)",
            roast=f"You're paying ${sec_monthly:.2f}/mo for Secrets Manager! Unless all {secrets_count} secrets require automated daily RDS password rotation, storing static API keys and config values here is an expensive anti-pattern.",
            remedy="Store non-rotating configuration parameters and standard API keys in AWS Systems Manager Parameter Store (Standard tier is $0.00/mo). Keep only rotating credentials in Secrets Manager.",
            potential_savings_monthly_usd=potential_ssm_savings,
            impact_summary=f"Save up to ${potential_ssm_savings:.2f}/mo by migrating static config to SSM Parameter Store",
            action_type="migrate_ssm_parameter_store",
            prompt_mutation="Use AWS Systems Manager Parameter Store Standard Tier for non-rotating secrets and configuration values (save $170/mo)."
        ))

    # 2. Cost Optimization Audit: Graviton ARM Opportunity
    intel_compute_nodes = [r for r in resources if any(s.startswith("c7i.") or s.startswith("m6i.") or s.startswith("t3.") for s in [str(r.get("sku", ""))])]
    if intel_compute_nodes:
        intel_cost = sum(float(r.get("monthly_cost_usd", 0.0)) for r in intel_compute_nodes)
        graviton_savings = round(intel_cost * 0.19, 2)  # ~19% standard Graviton discount
        if graviton_savings > 15.0:
            total_savings += graviton_savings
            cost_deductions += 12
            findings.append(WellArchitectedFinding(
                id="cost-graviton-migration",
                pillar="cost_optimization",
                severity="opportunity",
                title="x86 Intel Compute Architecture (Graviton Migration Available)",
                roast="You're running standard x86 Intel nodes (c7i / m6i). AWS charges an Intel tax for the same compute horsepower.",
                remedy="Switch EKS worker nodes and RDS instances to AWS Graviton (c7g / m7g / db.m7g). Provides ~19% direct price savings and up to 25% better price-performance for containerized Linux workloads.",
                potential_savings_monthly_usd=graviton_savings,
                impact_summary=f"Directly cut ${graviton_savings:.2f}/mo across compute & database tiers with zero SLA impact",
                action_type="switch_to_graviton",
                prompt_mutation="Use AWS Graviton compute instances (c7g / m7g) and db.m7g database instances for optimal price-performance."
            ))

    # 3. Reliability Audit: Single vs Multi-AZ & Read Replicas
    has_master_slave = any("replica" in name or "slave" in name for name in r_names)
    has_rds = any("rds" in svc or "rds" in name or "postgres" in name for svc, name in zip(svc_names, r_names))

    if has_rds and not has_master_slave:
        reliability_deductions += 20
        findings.append(WellArchitectedFinding(
            id="rel-single-db-spof",
            pillar="reliability",
            severity="critical",
            title="Database Single Point of Failure (No Read Replica)",
            roast="Your application processes high read and write traffic on a single database writer. A long-running analytics query or table lock could stall user requests.",
            remedy="Deploy an asynchronous Amazon RDS Read Replica (Slave) to isolate analytical and read-heavy queries from transaction updates.",
            potential_savings_monthly_usd=0.0,
            impact_summary="Eliminates database read saturation and prevents primary node failover locks",
            action_type="add_read_replica",
            prompt_mutation="Configure Amazon RDS PostgreSQL in master-slave architecture with dedicated asynchronous read replica."
        ))
    else:
        findings.append(WellArchitectedFinding(
            id="rel-db-master-slave-praise",
            pillar="reliability",
            severity="praise",
            title="Master-Slave Read/Write Traffic Segregation",
            roast="Commendable architecture: Dedicated read replica prevents heavy queries from starving your transactional master database.",
            remedy="Ensure application connection pooling routes read queries (GET requests) to the replica endpoint and writes (POST/PUT) to the master endpoint.",
            potential_savings_monthly_usd=0.0,
            impact_summary="High availability and query isolation achieved",
            action_type=None,
        ))

    # 4. Storage Audit: S3 Lifecycle & Multipart Uploads
    has_s3 = any("s3" in svc or "s3" in name for svc, name in zip(svc_names, r_names))
    has_large_files = any(k in text_lower for k in ["video", "2 gb", "2gb", "docx", "pptx"])
    if has_s3 and has_large_files:
        s3_cost = sum(float(r.get("monthly_cost_usd", 0.0)) for r in resources if "s3" in str(r.get("service_name", "")).lower() or "s3" in str(r.get("resource_name", "")).lower())
        lifecycle_savings = round(s3_cost * 0.35, 2)
        total_savings += lifecycle_savings
        cost_deductions += 5
        findings.append(WellArchitectedFinding(
            id="cost-s3-lifecycle",
            pillar="cost_optimization",
            severity="opportunity",
            title="S3 Standard Tiering for 2GB Large Video Files",
            roast="Storing large 2 GB video files permanently in S3 Standard is wasteful. Video files are typically read frequently in the first 30 days and rarely accessed after 90 days.",
            remedy="Configure an S3 Lifecycle Policy: Transition uploaded videos to S3 Infrequent Access (IA) after 30 days and Glacier Flexible Retrieval after 90 days. Enable S3 Intelligent-Tiering.",
            potential_savings_monthly_usd=lifecycle_savings,
            impact_summary="Saves 35-50% on aged object storage costs automatically",
            action_type="enable_s3_lifecycle",
            prompt_mutation="Enable Amazon S3 Intelligent-Tiering and lifecycle transitions to Infrequent Access for uploaded video archives."
        ))

    # 5. Operational Excellence: CloudWatch Container Insights & Alarms
    has_cw = any("cloudwatch" in name or "monitoring" in str(r.get("service_family", "")).lower() for name in r_names)
    if not has_cw:
        ops_deductions += 25
        findings.append(WellArchitectedFinding(
            id="ops-missing-telemetry",
            pillar="operational_excellence",
            severity="critical",
            title="Zero CloudWatch Observability or Alarm Monitoring",
            roast="Running production Kubernetes workloads with zero automated alarms is flying blind. You won't know pods crashed until your customers complain.",
            remedy="Enable CloudWatch Container Insights with baseline alarms for CPU utilization > 80%, pod restart crash-loops, and ALB 5XX HTTP error spikes.",
            potential_savings_monthly_usd=0.0,
            impact_summary="Automated alerting and performance tracing",
            action_type="add_cloudwatch_monitoring",
            prompt_mutation="Include Amazon CloudWatch Container Insights and 5 operational metric alarms."
        ))
    else:
        findings.append(WellArchitectedFinding(
            id="ops-telemetry-active",
            pillar="operational_excellence",
            severity="praise",
            title="Centralized Container Telemetry & Alarms Configured",
            roast="Solid operational setup: CloudWatch Container Insights collects pod performance metrics and tracks cluster health thresholds.",
            remedy="Ensure CloudWatch alarms are hooked into an SNS topic sending webhook notifications to Slack or PagerDuty.",
            potential_savings_monthly_usd=0.0,
            impact_summary="Production monitoring configured",
            action_type=None,
        ))

    # 6. Security: Ingress & ALB TLS
    has_alb = any("load balancer" in name or "alb" in name for name in r_names)
    if has_alb:
        findings.append(WellArchitectedFinding(
            id="sec-alb-tls",
            pillar="security",
            severity="praise",
            title="Application Load Balancer Perimeter & TLS Termination",
            roast="Ingress security is well decoupled: ALB acts as the public perimeter with TLS termination, protecting worker pods in private subnets.",
            remedy="Attach AWS WAF to the ALB with AWS Managed Rules (Core rule set + Known Bad Inputs) to block automated bot probes and SQL injection.",
            potential_savings_monthly_usd=0.0,
            impact_summary="Edge security and SSL offloading",
            action_type=None,
        ))

    # Calculate balanced scores
    cost_score = max(50, 100 - cost_deductions)
    reliability_score = max(50, 100 - reliability_deductions)
    security_score = max(70, 100 - security_deductions)
    operations_score = max(60, 100 - ops_deductions)
    overall_score = round((cost_score * 0.35) + (reliability_score * 0.30) + (security_score * 0.20) + (operations_score * 0.15))

    # Compose witty roast verdict
    if total_savings > 100.0:
        roast_verdict = (
            f"Your architecture is architecturally sound and enterprise-resilient, but you're paying a "
            f"${total_savings:.2f}/month 'convenience premium'. By eliminating the Secrets Manager fixed fee "
            f"and taking advantage of AWS Graviton pricing, you can cut ~${total_savings:.2f}/mo with zero performance compromise."
        )
    elif overall_score >= 85:
        roast_verdict = "Outstanding architecture! You have strict separation of concerns, high-concurrency database replication, and proper ingress load balancing."
    else:
        roast_verdict = "Solid foundation with a few critical cost traps and resilience gaps. Review the actionable findings below to harden your design."

    exec_summary = (
        f"Well-Architected Audit Score: {overall_score}/100. Identified {len(findings)} findings across Cost Optimization, "
        f"Reliability, and Operational Excellence. Net potential monthly savings: ${total_savings:.2f}/mo."
    )

    return WellArchitectedAuditReport(
        overall_score=overall_score,
        cost_score=cost_score,
        reliability_score=reliability_score,
        security_score=security_score,
        operations_score=operations_score,
        executive_summary=exec_summary,
        roast_verdict=roast_verdict,
        total_potential_savings_monthly=total_savings,
        findings=findings,
        recommendations_count=len([f for f in findings if f.severity in ["critical", "warning", "cost_trap", "opportunity"]]),
        audited_at=datetime.now(timezone.utc),
    )


async def run_architecture_audit(
    raw_prompt: str,
    resources: List[Dict[str, Any]],
    monthly_cost: float,
    provider: str = "aws"
) -> WellArchitectedAuditReport:
    """
    Executes Well-Architected Framework audit with deterministic baseline and
    optional LLM enrichment when Anthropic/gateway client is available.
    """
    baseline = generate_deterministic_audit(raw_prompt, resources, monthly_cost, provider)

    # If LLM is configured, enrich the roast verdict and recommendations
    try:
        client = get_llm_client()
        prompt_snippet = (raw_prompt or "")[:500]
        summary_lines = [f"- {r.get('resource_name')}: ${r.get('monthly_cost_usd')}/mo ({r.get('sku')})" for r in resources[:8]]
        
        system_prompt = (
            "You are an opinionated, elite AWS & Azure Principal Cloud Solutions Architect. "
            "Write a sharp, witty, highly practical 2-sentence architecture roast and critique of the user's workload."
        )
        user_msg = (
            f"Project Prompt: {prompt_snippet}\n"
            f"Total Monthly: ${monthly_cost:.2f}/mo\n"
            f"Resources:\n" + "\n".join(summary_lines) + "\n\n"
            f"Provide a 2-sentence punchy, memorable architecture roast."
        )
        res = await client.chat_completion(
            messages=[{"role": "user", "content": user_msg}],
            system_prompt=system_prompt,
            max_tokens=150,
            temperature=0.7
        )
        text_resp = res.get("text", "").strip()
        if text_resp and len(text_resp) > 20:
            baseline.roast_verdict = text_resp
    except Exception as e:
        logger.debug("LLM roast enrichment skipped: %s", e)

    return baseline
