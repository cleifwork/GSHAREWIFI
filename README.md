# 🛰️ GShareWiFi App

**GShareWiFi** is a **Google Apps Script (GAS)** web application that automates the creation, synchronization, and issuance of **WiFi vouchers** using **MacroDroid** automation on Android.

It connects your **Gmail**, **Google Drive**, and **MacroDroid** workflows — allowing you to issue WiFi access vouchers automatically when customers send payments via **GCash** or **Maya**.

---

## 🚀 Overview

Once set up, GShareWiFi can:
- Read new **“Recharge Card”** emails from your provider.  
- Extract voucher codes and group them by amount (₱5, ₱10, ₱20, etc.).  
- Store them in Google Drive as text files.  
- Generate and sync a **MacroDroid macro** that can automatically send WiFi vouchers to users.

When integrated with **GCash** or **Maya push notifications**, MacroDroid detects incoming payments and triggers the webhook — automatically issuing a matching WiFi voucher via SMS based on the amount sent.

💡 **Example:**  
A ₱10 GCash payment → triggers the push notification → sends back a ₱10 WiFi voucher SMS automatically.

---

## 🧩 Key Features

| Feature | Description |
|----------|-------------|
| 💌 **Automatic Voucher Parsing** | Reads and extracts voucher codes from your Gmail inbox. |
| 🗂️ **Drive-based File System** | Saves vouchers into categorized text files (`5php.txt`, `10php.txt`, etc.). |
| ⚙️ **Macro Generator** | Creates a ready-to-import `.macro` file for MacroDroid automation. |
| 🔗 **Webhook Integration** | Keeps MacroDroid updated with the latest voucher list. |
| 💳 **Payment Automation** | Works with GCash or Maya push notifications to issue vouchers automatically. |
| 🔄 **Sync & Maintenance** | “Force Update” option to rebuild or fix missing files. |
| 📱 **Responsive UI** | Optimized for both desktop and mobile GAS interfaces. |
| 🧾 **User Access Control** | Access limited through registered Gmail accounts and tokens in Google Sheets. |

---

## ⚙️ Components

### 🗂️ Google Apps Script Files
- **`GShareWiFiCode.gs`**  
  Core backend that:
  - Parses Gmail messages for vouchers.  
  - Manages voucher storage in Google Drive.  
  - Generates MacroDroid templates.  
  - Handles setup, webhook updates, and file clearing.

- **`GShareWiFiUI.html`**  
  The front-end web app that provides:
  - Setup configuration UI.  
  - Voucher file management table.  
  - Status messages, modals, and loaders.  
  - Mobile-responsive design.

---

## 🧾 Google Sheet (Access Control)

The Sheet contains the `AllowedUsers` tab with these columns:

| Column | Description |
|--------|-------------|
| Email | Authorized user Gmail address |
| Token | Authentication token for app access |
| Business Name | Hotspot or WiFi service name |
| Status | Active / Inactive |

---

## 🔧 Setup Instructions

### 1️⃣ Prerequisites
- Google Account (Gmail, GDrive access)
- MacroDroid installed on your Android phone  
- GCash or Maya app with push notifications enabled  

---

