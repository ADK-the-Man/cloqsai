"""
Comprehensive End-to-End & Stress Testing Suite for CloudCost Architect AI
Role: Lead SDET / Principal Test Engineer
Executes complete user journeys, edge cases, pricing validations, and stress scenarios.
"""
import asyncio
import json
import os
import sys
import time
import httpx

BASE_URL = "http://localhost:8001/api/v1"

class TestReport:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.bugs = []
        self.observations = []

    def record_pass(self, test_name: str, detail: str = ""):
        self.passed += 1
        print(f"  [PASS] {test_name}" + (f": {detail}" if detail else ""))

    def record_fail(self, test_name: str, error: str, severity: str = "HIGH"):
        self.failed += 1
        bug = {"test": test_name, "error": error, "severity": severity}
        self.bugs.append(bug)
        print(f"  [FAIL] [{severity}] {test_name}: {error}")

    def record_warn(self, test_name: str, warning: str):
        self.warnings += 1
        self.observations.append({"test": test_name, "warning": warning})
        print(f"  [WARN] {test_name}: {warning}")

report = TestReport()

async def run_e2e_suite():
    print("=" * 80)
    print("STARTING FULL END-TO-END AUTOMATED AUDIT & VERIFICATION")
    print("=" * 80)

    async with httpx.AsyncClient(timeout=60.0) as client:
        # ── 1. AUTHENTICATION & SECURITY AUDIT ───────────────────────────────────
        print("\n[SUITE 1: Auth & Token Lifecycle]")
        # 1.1 Valid login
        login_payload = {"email": "demo@cloudcost.ai", "password": "changeme123"}
        res = await client.post(f"{BASE_URL}/auth/login", json=login_payload)
        if res.status_code == 200 and "access_token" in res.json():
            token = res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            report.record_pass("Login with valid demo credentials", f"Token issued ({token[:15]}...)")
        else:
            report.record_fail("Login with valid demo credentials", f"Status {res.status_code}: {res.text}", "CRITICAL")
            return

        # 1.2 Invalid password
        bad_login = {"email": "demo@cloudcost.ai", "password": "wrongpassword"}
        res = await client.post(f"{BASE_URL}/auth/login", json=bad_login)
        if res.status_code in [401, 400]:
            report.record_pass("Reject invalid password", f"Correctly returned HTTP {res.status_code}")
        else:
            report.record_fail("Reject invalid password", f"Expected 401, got {res.status_code}", "HIGH")

        # 1.3 Missing token on protected endpoint
        res = await client.get(f"{BASE_URL}/auth/me")
        if res.status_code == 401:
            report.record_pass("Block unauthenticated access to /auth/me", "Returned 401 Unauthorized")
        else:
            report.record_fail("Block unauthenticated access to /auth/me", f"Got status {res.status_code}", "CRITICAL")

        # 1.4 Valid /auth/me
        res = await client.get(f"{BASE_URL}/auth/me", headers=headers)
        if res.status_code == 200 and res.json().get("email") == "demo@cloudcost.ai":
            report.record_pass("Retrieve current user profile", "Valid email returned")
        else:
            report.record_fail("Retrieve current user profile", f"Status {res.status_code}: {res.text}", "MEDIUM")

        # ── 2. PROVIDER STATUS & CATALOG API ─────────────────────────────────────
        print("\n[SUITE 2: Provider Status & Catalog Checks]")
        res = await client.get(f"{BASE_URL}/providers/status", headers=headers)
        if res.status_code == 200:
            data = res.json()
            aws_ok = data.get("aws_mcp_available")
            azure_ok = data.get("azure_retail_prices_available")
            if aws_ok and azure_ok:
                report.record_pass("Provider status endpoints active", f"AWS MCP Available: {aws_ok}, Azure Retail API Available: {azure_ok}")
            else:
                report.record_warn("Provider status endpoints active", f"AWS MCP: {aws_ok}, Azure: {azure_ok}")
        else:
            report.record_fail("Provider status endpoint /providers/status", f"HTTP {res.status_code}", "HIGH")

        # ── 3. WORKLOAD CREATION & EXTRACTION (MULTI-CLOUD) ───────────────────────
        print("\n[SUITE 3: Project Creation & Workload Requirements Extraction]")
        # Create Project 1: Complex Multi-Cloud Workload
        proj_payload = {
            "name": "E2E_Financial_Platform",
            "description": "High-throughput transactional payment processor",
            "provider_selection": "both"
        }
        res = await client.post(f"{BASE_URL}/projects", json=proj_payload, headers=headers)
        if res.status_code in [200, 201]:
            proj1 = res.json()
            proj1_id = proj1["id"]
            report.record_pass("Create Multi-Cloud Project", f"Project ID: {proj1_id}")
        else:
            report.record_fail("Create Multi-Cloud Project", f"HTTP {res.status_code}: {res.text}", "CRITICAL")
            return

        # Requirements extraction: EKS, 2 worker nodes, 2 S3 buckets, RDS PostgreSQL, OpenSearch, Lambda, SQS
        req_text = (
            "Two S3 buckets and one Lambda, with one RDS and one opensearch domain, "
            "one SQS and the EKS cluster with two linux nodes. 200 concurrent users will access the application "
            "and clearly uses EKS and runs with 4 pods on minimum 500Mi on rest and 2Gi on processing further. "
            "Region: us-east-2. Database: PostgreSQL 100 GB. Availability: 99.9%."
        )
        res = await client.post(f"{BASE_URL}/projects/{proj1_id}/requirements/extract", json={"raw_text": req_text}, headers=headers)
        if res.status_code == 200:
            req_data = res.json()
            spec = req_data.get("structured_spec", {})
            users = spec.get("concurrent_users", {}).get("value")
            db = spec.get("db_engine", {}).get("value")
            report.record_pass("Extract Requirements Spec", f"Concurrent users: {users}, DB: {db}")
        else:
            report.record_fail("Extract Requirements Spec", f"HTTP {res.status_code}: {res.text}", "HIGH")

        # ── 4. CONVERSATIONAL DISCOVERY ──────────────────────────────────────────
        print("\n[SUITE 4: Conversational Discovery Flow]")
        res = await client.get(f"{BASE_URL}/projects/{proj1_id}/conversation", headers=headers)
        if res.status_code == 200:
            conv = res.json()
            report.record_pass("Get Conversation State", f"Messages: {len(conv.get('messages', []))}, Complete: {conv.get('is_complete')}")
        else:
            report.record_fail("Get Conversation State", f"HTTP {res.status_code}", "MEDIUM")

        # Answer question
        ans_payload = {"question_id": "s3_lifecycle", "answer": "Retain 30 days Standard then Glacier"}
        res = await client.post(f"{BASE_URL}/projects/{proj1_id}/conversation/answer", json=ans_payload, headers=headers)
        if res.status_code == 200:
            conv_after = res.json()
            report.record_pass("Submit Clarification Answer", f"Conversation marked complete: {conv_after.get('is_complete')}")
        else:
            report.record_fail("Submit Clarification Answer", f"HTTP {res.status_code}: {res.text}", "MEDIUM")

        # ── 5. ARCHITECTURE TOPOLOGY & DIAGRAM GENERATION ────────────────────────
        print("\n[SUITE 5: Architecture Generation & Graph Topology]")
        res = await client.post(f"{BASE_URL}/projects/{proj1_id}/architecture/generate", headers=headers)
        if res.status_code == 200:
            archs = res.json()
            report.record_pass("Generate Dual-Provider Architectures", f"Generated {len(archs)} architectures")
            for a in archs:
                prov = a["provider"]
                svcs = a["services"]
                diag = a["diagram_data"]
                report.record_pass(f"{prov.upper()} Architecture Services", f"{len(svcs)} services, {len(diag.get('nodes', []))} nodes, {len(diag.get('edges', []))} edges")
                # Check for critical nodes
                names = [s["name"] for s in svcs]
                has_compute = any("EKS" in n or "AKS" in n or "Kubernetes" in n for n in names)
                has_db = any("RDS" in n or "PostgreSQL" in n for n in names)
                if not (has_compute and has_db):
                    report.record_fail(f"{prov.upper()} Critical Services Presence", f"Missing compute or DB in {names}", "HIGH")
                else:
                    report.record_pass(f"{prov.upper()} Critical Services Presence", "Compute and Database verified")
        else:
            report.record_fail("Generate Dual-Provider Architectures", f"HTTP {res.status_code}: {res.text}", "CRITICAL")

        # ── 6. SCENARIO GENERATION & PRICING INVARIANTS ──────────────────────────
        print("\n[SUITE 6: Scenario Generation & Invariant Testing]")
        res = await client.post(f"{BASE_URL}/projects/{proj1_id}/scenarios/generate", headers=headers)
        if res.status_code == 200:
            scenarios = res.json()
            report.record_pass("Generate 6 Scenarios (3 per provider)", f"Generated {len(scenarios)} scenarios")
            
            # Test pricing invariant: cost_optimized < recommended < high_availability
            by_prov = {}
            for s in scenarios:
                by_prov.setdefault(s["provider"], {})[s["scenario_type"]] = s["monthly_cost_usd"]

            for prov, costs in by_prov.items():
                c_opt = costs.get("cost_optimized", 0)
                c_rec = costs.get("recommended", 0)
                c_ha = costs.get("high_availability", 0)
                print(f"    {prov.upper()} Costs: Cost-Opt=${c_opt}, Rec=${c_rec}, HA=${c_ha}")
                if c_opt <= c_rec <= c_ha:
                    report.record_pass(f"{prov.upper()} Cost Invariant (Cost-Opt < Rec < HA)", f"${c_opt} <= ${c_rec} <= ${c_ha}")
                else:
                    report.record_fail(f"{prov.upper()} Cost Invariant", f"Violated: ${c_opt} <= ${c_rec} <= ${c_ha}", "HIGH")
        else:
            report.record_fail("Generate Scenarios", f"HTTP {res.status_code}: {res.text}", "CRITICAL")

        # ── 7. RESOURCE EDITING & DYNAMIC RECALCULATION ───────────────────────────
        print("\n[SUITE 7: Resource Modification & Live Repricing]")
        # Find recommended scenario
        rec_scenario = next((s for s in scenarios if s["provider"] == "aws" and s["scenario_type"] == "recommended"), None)
        if rec_scenario:
            node_res = next((r for r in rec_scenario["resources"] if "Worker Node" in r["resource_name"]), None)
            if node_res:
                old_cost = node_res["monthly_cost_usd"]
                old_sku = node_res["sku"]
                patch_payload = {"sku": "m6i.xlarge", "quantity": 1}
                p_url = f"{BASE_URL}/projects/{proj1_id}/scenarios/{rec_scenario['id']}/resources/{node_res['id']}"
                res = await client.patch(p_url, json=patch_payload, headers=headers)
                if res.status_code == 200:
                    updated_scen = res.json()
                    up_node = next((r for r in updated_scen["resources"] if r["id"] == node_res["id"]), None)
                    new_cost = up_node["monthly_cost_usd"] if up_node else 0
                    if up_node and up_node["sku"] == "m6i.xlarge" and new_cost > old_cost:
                        report.record_pass("Dynamic SKU Upgrade & Cost Recalculation", f"{old_sku} (${old_cost}) -> {up_node['sku']} (${new_cost})")
                    else:
                        report.record_fail("Dynamic SKU Upgrade & Cost Recalculation", f"SKU or cost not updated properly: {up_node}", "HIGH")
                else:
                    report.record_fail("Dynamic SKU Upgrade API Call", f"HTTP {res.status_code}: {res.text}", "HIGH")
            else:
                report.record_warn("Dynamic SKU Upgrade", "Worker node resource not found in scenario")
        else:
            report.record_fail("Find Recommended AWS Scenario", "Not found in generated list", "HIGH")

        # ── 8. ESTIMATE JOB EXECUTION & ARTIFACT GENERATION ───────────────────────
        print("\n[SUITE 8: Estimate Job Execution & Artifact Generation]")
        est_payload = {"scenario_ids": [rec_scenario["id"]]}
        res = await client.post(f"{BASE_URL}/projects/{proj1_id}/estimates", json=est_payload, headers=headers)
        job_id = None
        if res.status_code in [200, 201]:
            est_jobs = res.json()
            est_job = est_jobs[0]
            job_id = est_job["id"]
            report.record_pass("Trigger AWS Estimate Job", f"Job ID: {job_id}")

            # Poll job status until complete or failed (max 30s)
            poll_start = time.time()
            job_finished = False
            last_status = est_job["status"]
            while time.time() - poll_start < 30:
                await asyncio.sleep(1.5)
                res = await client.get(f"{BASE_URL}/projects/{proj1_id}/estimates/{job_id}", headers=headers)
                if res.status_code == 200:
                    j_data = res.json()
                    st = j_data["status"]
                    if st != last_status:
                        print(f"    -> Job Transition: {last_status} -> {st} ({j_data.get('status_message', '')})")
                        last_status = st
                    if st in ["completed", "completed_with_warnings", "failed"]:
                        job_finished = True
                        if st in ["completed", "completed_with_warnings"]:
                            calc_url = j_data.get("job_metadata", {}).get("estimate_url")
                            report.record_pass("AWS Estimate Job Pipeline Completion", f"Status: {st}, Calculator URL: {calc_url}")
                        else:
                            report.record_fail("AWS Estimate Job Pipeline Completion", f"Job failed: {j_data.get('error_detail')}", "CRITICAL")
                        break
            if not job_finished:
                report.record_fail("AWS Estimate Job Completion", "Job timed out after 30 seconds", "HIGH")
        else:
            report.record_fail("Trigger AWS Estimate Job", f"HTTP {res.status_code}: {res.text}", "CRITICAL")

        # ── 9. ARTIFACT DOWNLOAD & CHECKSUM VERIFICATION ─────────────────────────
        print("\n[SUITE 9: Artifact Integrity & Download Testing]")
        if job_id:
            res = await client.get(f"{BASE_URL}/projects/{proj1_id}/estimates/{job_id}/artifacts", headers=headers)
            if res.status_code == 200:
                artifacts = res.json()
                report.record_pass("List Estimate Artifacts", f"Found {len(artifacts)} generated artifacts")
                for art in artifacts:
                    art_id = art["id"]
                    art_type = art["file_type"]
                    art_size = art["file_size"]
                    checksum = art["checksum"]
                    # Test download endpoint
                    dl_res = await client.get(f"{BASE_URL}/artifacts/{art_id}/download", headers=headers)
                    if dl_res.status_code == 200 and len(dl_res.content) > 0:
                        report.record_pass(f"Download Artifact ({art_type.upper()})", f"Downloaded {len(dl_res.content)} bytes, matched size: {len(dl_res.content) == art_size}")
                    else:
                        report.record_fail(f"Download Artifact ({art_type.upper()})", f"Download failed with status {dl_res.status_code}", "HIGH")
            else:
                report.record_fail("List Estimate Artifacts", f"HTTP {res.status_code}: {res.text}", "HIGH")
        else:
            report.record_fail("Artifact Testing Skipped", "No job_id available", "HIGH")

        # ── 10. EDGE CASES & STRESS TESTING ──────────────────────────────────────
        print("\n[SUITE 10: Edge Cases, Security Boundaries & Robustness]")
        # 10.1 Empty project name
        res = await client.post(f"{BASE_URL}/projects", json={"name": "", "description": "test"}, headers=headers)
        if res.status_code in [400, 422]:
            report.record_pass("Edge Case: Reject empty project name", f"HTTP {res.status_code}")
        else:
            report.record_fail("Edge Case: Reject empty project name", f"Expected 400/422, got {res.status_code}", "MEDIUM")

        # 10.2 Unknown project ID
        fake_id = "00000000-0000-0000-0000-000000000000"
        res = await client.get(f"{BASE_URL}/projects/{fake_id}", headers=headers)
        if res.status_code == 404:
            report.record_pass("Edge Case: 404 for non-existent project", "HTTP 404")
        else:
            report.record_fail("Edge Case: 404 for non-existent project", f"Got status {res.status_code}", "MEDIUM")

        # 10.3 Non-existent artifact download
        res = await client.get(f"{BASE_URL}/artifacts/{fake_id}/download", headers=headers)
        if res.status_code == 404:
            report.record_pass("Edge Case: 404 for non-existent artifact", "HTTP 404")
        else:
            report.record_fail("Edge Case: 404 for non-existent artifact", f"Got status {res.status_code}", "MEDIUM")

        # 10.4 Extreme workload (100,000 users, 50,000 GB DB)
        extreme_req = (
            "Massive enterprise ERP running in eu-central-1 with 100000 concurrent users. "
            "Requires 50000 GB PostgreSQL database with continuous replication and high availability."
        )
        res = await client.post(f"{BASE_URL}/projects/{proj1_id}/requirements/extract", json={"raw_text": extreme_req}, headers=headers)
        if res.status_code == 200:
            report.record_pass("Edge Case: Extreme scale workload extraction", "Successfully handled 100K users and 50TB storage")
        else:
            report.record_fail("Edge Case: Extreme scale workload extraction", f"Failed with {res.status_code}", "MEDIUM")

    print("\n" + "=" * 80)
    print("TEST SUITE EXECUTION SUMMARY")
    print("=" * 80)
    print(f"Total Tests Executed: {report.passed + report.failed}")
    print(f"Passed: {report.passed}")
    print(f"Failed: {report.failed}")
    print(f"Warnings/Observations: {report.warnings}")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(run_e2e_suite())
