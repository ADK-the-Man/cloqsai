import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(base_url="http://localhost:8001/api/v1", timeout=30.0) as client:
        # 1. Login
        login_res = await client.post("/auth/login", json={"email": "demo@cloudcost.ai", "password": "changeme123"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Create Project
        proj_res = await client.post("/projects", json={"name": "Delta E2E Project", "provider_selection": "both"}, headers=headers)
        assert proj_res.status_code in [200, 201], f"Project creation failed: {proj_res.text}"
        proj_id = proj_res.json()["id"]

        # 3. Get Scenarios
        scen_res = await client.get(f"/projects/{proj_id}/scenarios", headers=headers)
        assert scen_res.status_code == 200
        scenarios = scen_res.json()
        target_scen = next(s for s in scenarios if s["provider"] == "aws" and s["scenario_type"] == "recommended")
        initial_cost = target_scen["monthly_cost_usd"]

        # 4. Add Delta Service (e.g. Redis Cache)
        delta_payload = {
            "resource_name": "ElastiCache Redis Multi-AZ Cluster",
            "service_family": "database",
            "service_name": "Amazon ElastiCache",
            "region": "us-east-2",
            "sku": "cache.r6g.large",
            "quantity": 2,
            "availability_config": "Multi-AZ",
            "pricing_model": "on-demand",
            "config": {"nodes": 2},
            "rationale": "High throughput sub-millisecond cache tier"
        }
        target_id = target_scen["id"]
        add_res = await client.post(f"/projects/{proj_id}/scenarios/{target_id}/resources", json=delta_payload, headers=headers)
        assert add_res.status_code == 200, f"Add delta service failed: {add_res.text}"
        updated_scen = add_res.json()
        new_cost = updated_scen["monthly_cost_usd"]
        delta_cost = new_cost - initial_cost

        print(f"[PASS] Delta Service Add: Initial=${initial_cost:.2f} -> New=${new_cost:.2f} (Delta=+${delta_cost:.2f})")
        assert delta_cost > 0, "Delta cost must be greater than 0"

        # 5. Run Estimate Job with Delta Update
        est_res = await client.post(f"/projects/{proj_id}/estimates", json={"scenario_ids": [target_id]}, headers=headers)
        assert est_res.status_code == 200, f"Estimate job launch failed: {est_res.text}"
        jobs = est_res.json()
        print(f"[PASS] Delta Estimate Job Launched: Job ID {jobs[0]['id']}, Status: {jobs[0]['status']}")

        print("[ALL DELTA E2E CHECKS PASSED]")

if __name__ == "__main__":
    asyncio.run(main())
