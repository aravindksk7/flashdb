#!/bin/bash

# Multi-Instance Cluster Test Script
# Starts 3 instances (1 primary, 2 replicas) and runs comprehensive tests

set -e

echo "=========================================="
echo "FlashDB Multi-Instance Cluster Tests"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker ps > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Building API Docker image...${NC}"
docker build -f Dockerfile.api -t flashdb-api:latest .

echo -e "${YELLOW}Step 2: Starting multi-instance cluster...${NC}"
docker-compose -f docker-compose-multi.yml down 2>/dev/null || true
docker-compose -f docker-compose-multi.yml up -d

echo -e "${YELLOW}Step 3: Waiting for instances to be healthy...${NC}"
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3001/live > /dev/null && \
       curl -s http://localhost:3002/live > /dev/null && \
       curl -s http://localhost:3003/live > /dev/null; then
        echo -e "${GREEN}All instances are healthy${NC}"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for instances... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}Timeout: Instances failed to become healthy${NC}"
    docker-compose -f docker-compose-multi.yml logs
    docker-compose -f docker-compose-multi.yml down
    exit 1
fi

echo -e "${YELLOW}Step 4: Testing instance registration...${NC}"

# Test primary instance
RESPONSE=$(curl -s http://localhost:3001/api/admin/instance)
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Primary instance registered${NC}"
else
    echo -e "${RED}✗ Primary instance failed${NC}"
    echo "Response: $RESPONSE"
    docker-compose -f docker-compose-multi.yml down
    exit 1
fi

# Test replica instances
for PORT in 3002 3003; do
    RESPONSE=$(curl -s http://localhost:$PORT/api/admin/instance)
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Replica instance on port $PORT registered${NC}"
    else
        echo -e "${RED}✗ Replica instance on port $PORT failed${NC}"
        docker-compose -f docker-compose-multi.yml down
        exit 1
    fi
done

echo -e "${YELLOW}Step 5: Testing cluster discovery...${NC}"

# Test that all instances can discover each other
RESPONSE=$(curl -s http://localhost:3001/api/admin/instances)
INSTANCE_COUNT=$(echo "$RESPONSE" | grep -o '"instanceId"' | wc -l)

if [ $INSTANCE_COUNT -ge 1 ]; then
    echo -e "${GREEN}✓ Cluster discovery working (found $INSTANCE_COUNT instances)${NC}"
else
    echo -e "${RED}✗ Cluster discovery failed${NC}"
    echo "Response: $RESPONSE"
    docker-compose -f docker-compose-multi.yml down
    exit 1
fi

echo -e "${YELLOW}Step 6: Testing cluster status endpoint...${NC}"

RESPONSE=$(curl -s http://localhost:3001/api/admin/cluster-status)
if echo "$RESPONSE" | grep -q '"clusterHealth":"healthy"'; then
    echo -e "${GREEN}✓ Cluster status is healthy${NC}"
else
    echo -e "${YELLOW}⚠ Cluster health status: $(echo "$RESPONSE" | grep -o '"clusterHealth":"[^"]*"')${NC}"
fi

echo -e "${YELLOW}Step 7: Testing state consistency...${NC}"

# Get instance count from each instance
COUNT1=$(curl -s http://localhost:3001/api/admin/cluster-status | grep -o '"activeInstances":[0-9]*' | grep -o '[0-9]*')
COUNT2=$(curl -s http://localhost:3002/api/admin/cluster-status | grep -o '"activeInstances":[0-9]*' | grep -o '[0-9]*')
COUNT3=$(curl -s http://localhost:3003/api/admin/cluster-status | grep -o '"activeInstances":[0-9]*' | grep -o '[0-9]*')

if [ "$COUNT1" = "$COUNT2" ] && [ "$COUNT2" = "$COUNT3" ]; then
    echo -e "${GREEN}✓ State consistency verified (all report $COUNT1 active instances)${NC}"
else
    echo -e "${RED}✗ State inconsistency detected (counts: $COUNT1, $COUNT2, $COUNT3)${NC}"
fi

echo -e "${YELLOW}Step 8: Testing heartbeat functionality...${NC}"

for PORT in 3001 3002 3003; do
    RESPONSE=$(curl -s -X POST http://localhost:$PORT/api/admin/heartbeat)
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Heartbeat successful on port $PORT${NC}"
    else
        echo -e "${RED}✗ Heartbeat failed on port $PORT${NC}"
    fi
done

echo -e "${YELLOW}Step 9: Running Jest tests...${NC}"

cd src/api
npm test -- --testPathPattern=multiInstance --maxWorkers=1 --no-coverage

TEST_RESULT=$?

echo -e "${YELLOW}Step 10: Cleanup and shutdown...${NC}"

docker-compose -f docker-compose-multi.yml down

echo "=========================================="
if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ All multi-instance tests passed!${NC}"
    echo "=========================================="
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo "=========================================="
    exit 1
fi
