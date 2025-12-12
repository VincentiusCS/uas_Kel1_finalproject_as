#!/bin/bash

# Wait for Keycloak to be ready
echo "Waiting for Keycloak to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:8080/auth/realms/master > /dev/null; then
    echo "Keycloak is ready!"
    break
  fi
  echo "Attempt $i/30..."
  sleep 2
done

# Get admin token
echo "Getting admin token from Keycloak..."
TOKEN=$(curl -s -X POST \
  "http://localhost:8080/auth/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli&grant_type=password&username=admin&password=admin123" \
  | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Could not get admin token"
  exit 1
fi

echo "Token obtained: ${TOKEN:0:20}..."

# Create realm
echo "Creating inventory-realm..."
curl -s -X POST \
  "http://localhost:8080/auth/admin/realms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "realm": "inventory-realm",
    "enabled": true,
    "displayName": "Inventory Management Realm",
    "loginTheme": "keycloak"
  }' | jq .

# Create role 'admin'
echo "Creating admin role..."
curl -s -X POST \
  "http://localhost:8080/auth/admin/realms/inventory-realm/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "admin",
    "description": "Administrator role"
  }' | jq .

# Create role 'manager'
echo "Creating manager role..."
curl -s -X POST \
  "http://localhost:8080/auth/admin/realms/inventory-realm/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "manager",
    "description": "Manager role"
  }' | jq .

# Create role 'user'
echo "Creating user role..."
curl -s -X POST \
  "http://localhost:8080/auth/admin/realms/inventory-realm/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user",
    "description": "Regular user role"
  }' | jq .

# Create client
echo "Creating inventory-app client..."
CLIENT_RESPONSE=$(curl -s -X POST \
  "http://localhost:8080/auth/admin/realms/inventory-realm/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "inventory-app",
    "name": "Inventory Management App",
    "enabled": true,
    "publicClient": false,
    "redirectUris": [
      "http://localhost:3000/*",
      "http://localhost:3000"
    ],
    "webOrigins": [
      "http://localhost:3000"
    ],
    "protocol": "openid-connect",
    "standardFlowEnabled": true,
    "implicitFlowEnabled": false,
    "directAccessGrantsEnabled": true,
    "serviceAccountsEnabled": true
  }')

echo "Client created:"
echo "$CLIENT_RESPONSE" | jq .

# Get client ID
CLIENT_ID=$(echo "$CLIENT_RESPONSE" | jq -r '.id')
echo "Client ID: $CLIENT_ID"

# Get client secret
echo "Generating client secret..."
SECRET_RESPONSE=$(curl -s -X POST \
  "http://localhost:8080/auth/admin/realms/inventory-realm/clients/$CLIENT_ID/client-secret" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

CLIENT_SECRET=$(echo "$SECRET_RESPONSE" | jq -r '.value')
echo "Client Secret: $CLIENT_SECRET"

# Create test users
echo "Creating test users..."

# Admin user
curl -s -X POST \
  "http://localhost:8080/auth/admin/realms/inventory-realm/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "enabled": true,
    "firstName": "Admin",
    "lastName": "User",
    "credentials": [{
      "type": "password",
      "value": "admin123",
      "temporary": false
    }]
  }' | jq .

# Manager user
curl -s -X POST \
  "http://localhost:8080/auth/admin/realms/inventory-realm/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "manager",
    "email": "manager@example.com",
    "enabled": true,
    "firstName": "Manager",
    "lastName": "User",
    "credentials": [{
      "type": "password",
      "value": "manager123",
      "temporary": false
    }]
  }' | jq .

# Regular user
curl -s -X POST \
  "http://localhost:8080/auth/admin/realms/inventory-realm/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user",
    "email": "user@example.com",
    "enabled": true,
    "firstName": "Regular",
    "lastName": "User",
    "credentials": [{
      "type": "password",
      "value": "user123",
      "temporary": false
    }]
  }' | jq .

echo ""
echo "=========================================="
echo "Keycloak Setup Complete!"
echo "=========================================="
echo "Realm: inventory-realm"
echo "Client: inventory-app"
echo "Client Secret: $CLIENT_SECRET"
echo "Admin User: admin / admin123"
echo "Manager User: manager / manager123"
echo "Regular User: user / user123"
echo ""
echo "Keycloak URL: http://localhost:8080"
echo "Admin Console: http://localhost:8080/auth/admin"
echo "App URL: http://localhost:3000"
echo "=========================================="
