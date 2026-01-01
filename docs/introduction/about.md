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

## No Lock-In, Ever

A core design principle of KiwiPanel is **zero lock-in**.

- KiwiPanel can be **safely uninstalled at any time** using:
  ```bash
  kiwipanel uninstall
