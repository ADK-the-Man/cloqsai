from __future__ import annotations
"""
Scenario generator: produces 3 distinct, production-grade architectural scenarios
(cost_optimized, recommended, high_availability) with honest assumptions and trade-offs.
"""
from typing import Any, Dict, List, Optional
from ai.stages.sizing_engine import size_aws_workload, size_azure_workload, parse_workload_signals, analyze_budget_feasibility
from models.schemas import ScenarioResource


def generate_scenarios_for_provider(provider: str, req: Dict[str, Any]) -> List[Dict[str, Any]]:
    p = provider.lower()
    scenarios = []

    scenario_types = [
        ("cost_optimized", "Cost-Optimized", "Single-AZ minimal configuration optimized for non-critical workloads and tight budgets."),
        ("recommended", "Recommended Production", "Resilient multi-AZ architecture with automated recovery, right-sized for target workload."),
        ("high_availability", "High Availability & Growth", "Zero-single-point-of-failure deployment designed for 2x scale, read replicas, and strict SLAs.")
    ]

    for st_key, st_title, st_desc in scenario_types:
        if p == "aws":
            raw_resources = size_aws_workload(req, scenario_type=st_key)
        else:
            raw_resources = size_azure_workload(req, scenario_type=st_key)

        monthly_total = sum(r["monthly_cost_usd"] for r in raw_resources)
        annual_total = monthly_total * 12

        if st_key == "cost_optimized":
            assumptions = [
                "Single Availability Zone deployment",
                "Burst-tier compute instances (CPU credits apply)",
                "Standard 7-day automated backups",
                "Operating hours can be scheduled off-peak for further savings"
            ]
            exclusions = [
                "Enterprise 24x7 phone support",
                "Advanced Web Application Firewall (WAF) managed rules",
                "Multi-region disaster recovery replication"
            ]
            cost_drivers = ["Database instance and SSD persistent volume", "Application compute node"]
            limitations = [
                "Downtime during host degradation or zone-level maintenance",
                "Not recommended for regulatory PCI-DSS / HIPAA compliance without hardened controls"
            ]
        elif st_key == "recommended":
            assumptions = [
                "Active/Active compute across 2 independent Availability Zones",
                "Synchronous standby database replication with automatic failover (< 60s)",
                "Daily automated snapshots with 30-day retention",
                "Application Load Balancer health checks and auto-drain"
            ]
            exclusions = [
                "Cross-region global traffic manager",
                "Dedicated hardware tenancy"
            ]
            cost_drivers = ["Multi-AZ database standby overhead", "Dual active application compute nodes"]
            limitations = ["Sustains maximum 2x peak traffic burst before scaling limit is reached"]
        else:  # high_availability
            assumptions = [
                "Redundant compute nodes scaled for 2x anticipated growth across 3 AZs",
                "Primary database + read replica to isolate analytical / reporting queries",
                "Continuous automated point-in-time recovery (PITR) up to 35 days",
                "Enhanced monitoring with 1-minute metric resolution"
            ]
            exclusions = ["Active/Active multi-region database clustering"]
            cost_drivers = ["Read replica instance and secondary storage costs", "High compute node count"]
            limitations = ["Higher fixed base commitment"]

        sig = parse_workload_signals(req)
        budget_analysis = analyze_budget_feasibility(sig.get("target_budget"), monthly_total, raw_resources, p)
        if budget_analysis["has_budget"]:
            variance_sign = "+$" if budget_analysis["variance"] > 0 else "-$"
            assumptions.insert(0, f"Target Budget: ${budget_analysis['target_budget']:.2f}/mo (Actual: ${monthly_total:.2f}/mo, Variance: {variance_sign}{abs(budget_analysis['variance']):.2f}/mo)")
            if not budget_analysis["is_within_budget"]:
                limitations.insert(0, budget_analysis["justification"])

        scenarios.append({
            "provider": p,
            "scenario_type": st_key,
            "resources": [ScenarioResource(**r) for r in raw_resources],
            "monthly_cost_usd": round(monthly_total, 2),
            "annual_cost_usd": round(annual_total, 2),
            "assumptions": assumptions,
            "exclusions": exclusions,
            "cost_drivers": cost_drivers,
            "limitations": limitations,
        })

    return scenarios
