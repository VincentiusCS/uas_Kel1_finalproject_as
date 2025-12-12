#!/usr/bin/env python3
"""
Keycloak Realm & Client Setup Script
"""
import json
import time
import requests
import sys

KEYCLOAK_URL = "http://localhost:8080"
ADMIN_USER = "admin"
ADMIN_PASSWORD = "admin123"
REALM_NAME = "inventory-realm"
CLIENT_ID = "inventory-app"

def wait_for_keycloak(max_retries=60):
    """Wait for Keycloak to be ready"""
    print("Waiting for Keycloak to be ready...")
    for i in range(max_retries):
        try:
            response = requests.get(f"{KEYCLOAK_URL}/auth/realms/master", timeout=5)
            if response.status_code == 200:
                print("✓ Keycloak is ready!")
                return True
        except:
            pass
        print(f"  Attempt {i+1}/{max_retries}...")
        time.sleep(2)
    
    print("✗ Keycloak did not become ready in time")
    return False

def get_admin_token():
    """Get admin token from Keycloak"""
    print("Getting admin token...")
    url = f"{KEYCLOAK_URL}/auth/realms/master/protocol/openid-connect/token"
    data = {
        "client_id": "admin-cli",
        "grant_type": "password",
        "username": ADMIN_USER,
        "password": ADMIN_PASSWORD
    }
    
    response = requests.post(url, data=data)
    if response.status_code != 200:
        print(f"✗ Failed to get token: {response.text}")
        return None
    
    token = response.json().get("access_token")
    print(f"✓ Token obtained: {token[:20]}...")
    return token

def create_realm(token):
    """Create inventory-realm"""
    print(f"\nCreating realm '{REALM_NAME}'...")
    url = f"{KEYCLOAK_URL}/auth/admin/realms"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "realm": REALM_NAME,
        "enabled": True,
        "displayName": "Inventory Management Realm",
        "loginTheme": "keycloak"
    }
    
    response = requests.post(url, headers=headers, json=data)
    if response.status_code in [201, 409]:  # 409 = already exists
        print(f"✓ Realm '{REALM_NAME}' ready")
        return True
    else:
        print(f"✗ Failed: {response.text}")
        return False

def create_roles(token):
    """Create roles"""
    roles = ["admin", "manager", "user"]
    print("\nCreating roles...")
    
    for role_name in roles:
        url = f"{KEYCLOAK_URL}/auth/admin/realms/{REALM_NAME}/roles"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        data = {
            "name": role_name,
            "description": f"{role_name.capitalize()} role"
        }
        
        response = requests.post(url, headers=headers, json=data)
        if response.status_code in [201, 409]:
            print(f"  ✓ Role '{role_name}' ready")
        else:
            print(f"  ✗ Failed to create role '{role_name}': {response.text}")
    
    return True

def create_client(token):
    """Create inventory-app client"""
    print(f"\nCreating client '{CLIENT_ID}'...")
    url = f"{KEYCLOAK_URL}/auth/admin/realms/{REALM_NAME}/clients"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "clientId": CLIENT_ID,
        "name": "Inventory Management App",
        "enabled": True,
        "publicClient": False,
        "redirectUris": [
            "http://localhost:3000/*",
            "http://localhost:3000"
        ],
        "webOrigins": [
            "http://localhost:3000"
        ],
        "protocol": "openid-connect",
        "standardFlowEnabled": True,
        "implicitFlowEnabled": False,
        "directAccessGrantsEnabled": True,
        "serviceAccountsEnabled": True
    }
    
    response = requests.post(url, headers=headers, json=data)
    if response.status_code != 201:
        if response.status_code == 409:
            print(f"  Client already exists, fetching existing client...")
            # Get existing client
            url_list = f"{KEYCLOAK_URL}/auth/admin/realms/{REALM_NAME}/clients?clientId={CLIENT_ID}"
            resp = requests.get(url_list, headers=headers)
            if resp.status_code == 200 and len(resp.json()) > 0:
                return resp.json()[0]
        else:
            print(f"  ✗ Failed: {response.text}")
            return None
    
    client_data = response.json()
    print(f"  ✓ Client created: {client_data.get('id')}")
    return client_data

def get_client_secret(token, client_id):
    """Get or create client secret"""
    print(f"\nGetting client secret...")
    url = f"{KEYCLOAK_URL}/auth/admin/realms/{REALM_NAME}/clients/{client_id}/client-secret"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # First try to get existing secret
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        secret = response.json().get("value")
        print(f"  ✓ Existing secret: {secret[:20]}...")
        return secret
    
    # Create new secret
    response = requests.post(url, headers=headers)
    if response.status_code == 200:
        secret = response.json().get("value")
        print(f"  ✓ New secret: {secret[:20]}...")
        return secret
    else:
        print(f"  ✗ Failed: {response.text}")
        return None

def create_users(token):
    """Create test users"""
    print("\nCreating test users...")
    
    users = [
        {
            "username": "admin",
            "email": "admin@example.com",
            "firstName": "Admin",
            "lastName": "User",
            "password": "admin123"
        },
        {
            "username": "manager",
            "email": "manager@example.com",
            "firstName": "Manager",
            "lastName": "User",
            "password": "manager123"
        },
        {
            "username": "user",
            "email": "user@example.com",
            "firstName": "Regular",
            "lastName": "User",
            "password": "user123"
        }
    ]
    
    for user in users:
        url = f"{KEYCLOAK_URL}/auth/admin/realms/{REALM_NAME}/users"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        password = user.pop("password")
        user_data = {
            **user,
            "enabled": True,
            "credentials": [{
                "type": "password",
                "value": password,
                "temporary": False
            }]
        }
        
        response = requests.post(url, headers=headers, json=user_data)
        if response.status_code in [201, 409]:
            print(f"  ✓ User '{user['username']}' ready")
        else:
            print(f"  ✗ Failed: {response.text}")
    
    return True

def main():
    """Main setup flow"""
    print("=" * 50)
    print("Keycloak Setup Script")
    print("=" * 50)
    
    if not wait_for_keycloak():
        sys.exit(1)
    
    token = get_admin_token()
    if not token:
        sys.exit(1)
    
    create_realm(token)
    create_roles(token)
    client = create_client(token)
    
    if not client:
        print("✗ Failed to create/get client")
        sys.exit(1)
    
    client_id = client.get("id")
    secret = get_client_secret(token, client_id)
    create_users(token)
    
    print("\n" + "=" * 50)
    print("✓ Keycloak Setup Complete!")
    print("=" * 50)
    print(f"Realm: {REALM_NAME}")
    print(f"Client: {CLIENT_ID}")
    print(f"Client Secret: {secret}")
    print()
    print("Test Credentials:")
    print("  Admin: admin / admin123")
    print("  Manager: manager / manager123")
    print("  User: user / user123")
    print()
    print("URLs:")
    print(f"  Keycloak: {KEYCLOAK_URL}")
    print(f"  Admin Console: {KEYCLOAK_URL}/auth/admin")
    print("  App: http://localhost:3000")
    print("=" * 50)

if __name__ == "__main__":
    main()
