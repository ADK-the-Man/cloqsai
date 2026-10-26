import pytest
from ai.stages.sizing_engine import size_aws_workload, size_azure_workload


def test_aws_workload_sizing():
    req = {
        "concurrent_users": 150,
        "db_storage_gb": 100,
        "peak_rps": 100,
    }
    resources = size_aws_workload(req, scenario_type="recommended")
    assert len(resources) >= 4
    service_names = [r["service_name"] for r in resources]
    assert "AmazonEC2" in service_names
    assert "AmazonRDS" in service_names
    assert "ElasticLoadBalancing" in service_names


def test_azure_workload_sizing():
    req = {
        "concurrent_users": 200,
        "db_storage_gb": 150,
    }
    resources = size_azure_workload(req, scenario_type="recommended")
    assert len(resources) >= 4
    service_names = [r["service_name"] for r in resources]
    assert "Virtual Machines" in service_names
    assert "Azure Database for PostgreSQL" in service_names
    assert "Application Gateway" in service_names
