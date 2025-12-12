#!/usr/bin/env python3
"""
Setup Keycloak realm and client for inventory-app
"""
import json
import requests
import time
import sys
import os

# Set output encoding to UTF-8
if sys.stdout.encoding != 'utf-8':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

# Configuration
KEYCLOAK_URL = "http://localhost:8080"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"
REALM_NAME = "inventory-realm"
CLIENT_ID = "inventory-app"
CLIENT_SECRET = "YsfJFu3yvwvI5sKMzkhA0rRI0mpEGhsf"

def get_admin_token():
    """Get admin access token from Keycloak"""
    url = f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    data = {
        "client_id": "admin-cli",
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD,
        "grant_type": "password"
    }
    try:
        resp = requests.post(url, data=data, timeout=10)
        resp.raise_for_status()
        return resp.json()["access_token"]
    except Exception as e:
        print(f"❌ Failed to get admin token: {e}")
        return None

def create_realm(token):
    """Create realm if not exists"""
    url = f"{KEYCLOAK_URL}/admin/realms"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Check if realm exists
    try:
        resp = requests.get(f"{url}/{REALM_NAME}", headers=headers, timeout=10)
        if resp.status_code == 200:
            print(f"✓ Realm '{REALM_NAME}' already exists")
            return True
    except:
        pass
    
    # Create realm
    realm_data = {
        "realm": REALM_NAME,
        "enabled": True,
        "displayName": "Inventory Management System",
        "sslRequired": "none",
        "registrationAllowed": False,
        "loginTheme": "keycloak"
    }
    
    try:
        resp = requests.post(url, json=realm_data, headers=headers, timeout=10)
        if resp.status_code in [201, 409]:  # 409 = already exists
            print(f"✓ Realm '{REALM_NAME}' created or already exists")
            return True
        else:
            print(f"❌ Failed to create realm: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Error creating realm: {e}")
        return False

def create_client(token):
    """Create client for app"""
    url = f"{KEYCLOAK_URL}/admin/realms/{REALM_NAME}/clients"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Check if client exists - and update if needed
    try:
        resp = requests.get(f"{url}?clientId={CLIENT_ID}", headers=headers, timeout=10)
        if resp.status_code == 200 and resp.json():
            existing_client = resp.json()[0]
            client_uuid = existing_client['id']
            print(f"✓ Client '{CLIENT_ID}' already exists (UUID: {client_uuid})")
            
            # Update the client with correct configuration
            update_client(token, client_uuid)
            return True
    except Exception as e:
        print(f"  Info: {e}")
    
    # Create client
    client_data = {
        "clientId": CLIENT_ID,
        "name": "Inventory Management App",
        "enabled": True,
        "publicClient": False,
        "secret": CLIENT_SECRET,
        "redirectUris": [
            "http://localhost:3000/",
            "http://localhost:3000",
            "http://localhost:3000/?auth_callback=1",
            "http://localhost:3000/*"
        ],
        "webOrigins": [
            "http://localhost:3000",
            "http://localhost:3000/"
        ],
        "standardFlowEnabled": True,
        "implicitFlowEnabled": False,
        "directAccessGrantsEnabled": True,
        "serviceAccountsEnabled": True,
        "authorizationServicesEnabled": False,
        "fullScopeAllowed": True
    }
    
    try:
        resp = requests.post(url, json=client_data, headers=headers, timeout=10)
        if resp.status_code in [201, 409]:
            print(f"✓ Client '{CLIENT_ID}' created or already exists")
            return True
        else:
            print(f"❌ Failed to create client: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Error creating client: {e}")
        return False

def update_client(token, client_uuid):
    """Update existing client configuration"""
    url = f"{KEYCLOAK_URL}/admin/realms/{REALM_NAME}/clients/{client_uuid}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    client_data = {
        "clientId": CLIENT_ID,
        "name": "Inventory Management App",
        "enabled": True,
        "publicClient": False,
        "secret": CLIENT_SECRET,
        "redirectUris": [
            "http://localhost:3000/",
            "http://localhost:3000",
            "http://localhost:3000/?auth_callback=1",
            "http://localhost:3000/*"
        ],
        "webOrigins": [
            "http://localhost:3000",
            "http://localhost:3000/"
        ],
        "standardFlowEnabled": True,
        "implicitFlowEnabled": False,
        "directAccessGrantsEnabled": True,
        "serviceAccountsEnabled": True,
        "authorizationServicesEnabled": False,
        "fullScopeAllowed": True
    }
    
    try:
        resp = requests.put(url, json=client_data, headers=headers, timeout=10)
        if resp.status_code in [200, 204]:
            print(f"   ✓ Client configuration updated")
        else:
            print(f"   ⚠ Could not update client: {resp.status_code}")
    except Exception as e:
        print(f"   ⚠ Error updating client: {e}")

def create_roles(token):
    """Create roles"""
    url = f"{KEYCLOAK_URL}/admin/realms/{REALM_NAME}/roles"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    roles = ["admin", "manager", "user"]
    
    for role in roles:
        # Check if role exists
        try:
            resp = requests.get(f"{url}/{role}", headers=headers, timeout=10)
            if resp.status_code == 200:
                print(f"✓ Role '{role}' already exists")
                continue
        except:
            pass
        
        # Create role
        role_data = {
            "name": role,
            "description": f"{role.capitalize()} role"
        }
        
        try:
            resp = requests.post(url, json=role_data, headers=headers, timeout=10)
            if resp.status_code in [201, 409]:
                print(f"✓ Role '{role}' created or already exists")
            else:
                print(f"❌ Failed to create role '{role}': {resp.status_code}")
        except Exception as e:
            print(f"❌ Error creating role '{role}': {e}")

def create_users(token):
    """Create test users"""
    url = f"{KEYCLOAK_URL}/admin/realms/{REALM_NAME}/users"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    users = [
        {"username": "admin", "password": "admin123", "role": "admin"},
        {"username": "manager", "password": "manager123", "role": "manager"},
        {"username": "user", "password": "user123", "role": "user"}
    ]
    
    for user_info in users:
        username = user_info["username"]
        password = user_info["password"]
        role = user_info["role"]
        
        # Check if user exists
        try:
            resp = requests.get(f"{url}?username={username}", headers=headers, timeout=10)
            if resp.status_code == 200 and resp.json():
                print(f"✓ User '{username}' already exists")
                continue
        except:
            pass
        
        # Create user
        user_data = {
            "username": username,
            "firstName": username.capitalize(),
            "enabled": True,
            "credentials": [
                {
                    "type": "password",
                    "value": password,
                    "temporary": False
                }
            ]
        }
        
        try:
            resp = requests.post(url, json=user_data, headers=headers, timeout=10)
            if resp.status_code == 201:
                user_id = resp.headers.get("location", "").split("/")[-1]
                print(f"✓ User '{username}' created")
                
                # Assign role
                if user_id:
                    assign_role_to_user(token, user_id, role)
            elif resp.status_code == 409:
                print(f"✓ User '{username}' already exists")
            else:
                print(f"❌ Failed to create user '{username}': {resp.status_code} - {resp.text}")
        except Exception as e:
            print(f"❌ Error creating user '{username}': {e}")

def assign_role_to_user(token, user_id, role_name):
    """Assign role to user"""
    # Get role
    role_url = f"{KEYCLOAK_URL}/admin/realms/{REALM_NAME}/roles/{role_name}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    try:
        resp = requests.get(role_url, headers=headers, timeout=10)
        if resp.status_code != 200:
            print(f"   ❌ Could not find role '{role_name}'")
            return
        
        role_data = resp.json()
        
        # Assign role to user
        assign_url = f"{KEYCLOAK_URL}/admin/realms/{REALM_NAME}/users/{user_id}/role-mappings/realm"
        resp = requests.post(assign_url, json=[role_data], headers=headers, timeout=10)
        
        if resp.status_code in [200, 204]:
            print(f"   ✓ Role '{role_name}' assigned")
        else:
            print(f"   ❌ Failed to assign role: {resp.status_code}")
    except Exception as e:
        print(f"   ❌ Error assigning role: {e}")

def main():
    print("=" * 60)
    print("Keycloak Setup for Inventory Management System")
    print("=" * 60)
    
    # Check Keycloak availability
    print("\n1. Checking Keycloak availability...")
    for attempt in range(5):
        try:
            resp = requests.get(f"{KEYCLOAK_URL}/realms/master", timeout=5)
            if resp.status_code == 200:
                print(f"✓ Keycloak is available at {KEYCLOAK_URL}")
                break
        except:
            if attempt < 4:
                print(f"   Attempt {attempt + 1}/5 - Retrying in 10 seconds...")
                time.sleep(10)
            else:
                print(f"❌ Cannot connect to Keycloak at {KEYCLOAK_URL}")
                sys.exit(1)
    
    # Get admin token
    print("\n2. Authenticating as admin...")
    token = get_admin_token()
    if not token:
        print("❌ Failed to authenticate")
        sys.exit(1)
    print("✓ Admin authentication successful")
    
    # Create realm
    print(f"\n3. Creating realm '{REALM_NAME}'...")
    if not create_realm(token):
        sys.exit(1)
    
    # Create roles
    print("\n4. Creating roles...")
    create_roles(token)
    
    # Create client
    print(f"\n5. Creating client '{CLIENT_ID}'...")
    if not create_client(token):
        sys.exit(1)
    
    # Create users
    print("\n6. Creating test users...")
    create_users(token)
    
    print("\n" + "=" * 60)
    print("✓ Keycloak setup completed successfully!")
    print("=" * 60)
    print("\nAccess Keycloak admin console:")
    print(f"  URL: {KEYCLOAK_URL}/admin/")
    print(f"  Username: {ADMIN_USERNAME}")
    print(f"  Password: {ADMIN_PASSWORD}")
    print("\nTest users:")
    for user in ["admin", "manager", "user"]:
        print(f"  {user} / {user}123")

if __name__ == "__main__":
    main()
