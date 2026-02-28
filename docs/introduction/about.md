# Introduction

## KiwiPanel

⚠️ **WARNING: PRE-ALPHA RELEASE — DO NOT DEPLOY TO PRODUCTION**

KiwiPanel is a lightweight, open-source server control panel focused on **simplicity, transparency, and sane defaults**.  

It is designed to help you manage a **LOMP stack** (Linux, OpenLiteSpeed, MariaDB, PHP) without bloat or lock-in.

## Built for Developers & VPS Users

KiwiPanel is written primarily in **Go**, with a strong emphasis on:

- Minimal resource usage
- Clear system visibility
- Scriptable and inspectable behavior
- Clean separation between the panel and the server stack

It is designed for:

- Developers who want full visibility into how their server works  
- VPS users who prefer lightweight tooling over heavy abstractions  
- System administrators who value reproducibility, auditability, and control  

## Feature Comparison

| Category | Feature | KiwiPanel | aaPanel | CloudPanel | CyberPanel | FastPanel |
|--------|--------|----------|--------|------------|------------|-----------|
| **Users** | Admin user | ✅ | ✅ | ✅ | ✅ | ✅ |
|  | Client users | ✅ | ✅ | ❌ | ✅ | ✅ |
|  | User isolation | 🔒 Per-user | 🔒 Per-user | 🔒 Subscription | 🔒 Per-user | 🔒 Per-user |
| **Web** | Web server | OpenLiteSpeed | Nginx / Apache / OLS | Nginx | OpenLiteSpeed | Nginx |
|  | Multiple PHP versions | ✅ | ✅ | ✅ | ✅ | ✅ |
|  | Per-site config | ✅ | ⚠️ Limited | ✅ | ⚠️ Limited | ✅ |
| **Security** | Firewall UI | ❌ | ✅ | ✅ | ❌ | ✅ |
|  | Malware scan | Planned | ✅ | ❌ | ⚠️ Limited | ❌ |
|  | Auto SSL | ✅ | ✅ | ✅ | ✅ | ✅ |
