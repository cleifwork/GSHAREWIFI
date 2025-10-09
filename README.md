# 🛰️ GShareWiFi Utility App

**GShareWiFi Utility App - GWUA** is a **Google Apps Script (GAS)** web application that automates the creation, synchronization, and issuance of **WiFi vouchers** using **MacroDroid** automation on Android.

It connects your **Gmail**, **Google Drive**, and **MacroDroid** workflows — allowing you to issue WiFi access vouchers automatically when customers send payments via **GCash** or **Maya**.

---

## 🚀 Overview

Once set up, GShareWiFi can:
- Read new **“Recharge Card”** emails from your provider.  
- Extract voucher codes and group them by amount (₱5, ₱10, ₱20, etc.).  
- Store them in Google Drive as text files.  
- Generate and sync a **MacroDroid macro** that can automatically send WiFi vouchers to users.

When integrated with **GCash** or **Maya push notifications**, MacroDroid detects incoming payments thru push notifications and triggers the macro — automatically issuing a matching WiFi voucher via SMS based on the amount sent.

---

## 🧩 Key Features

| Feature | Description |
|----------|-------------|
| 💌 **Automatic Voucher Parsing** | Reads and extracts voucher codes from your Gmail inbox. |
| 🗂️ **Drive-based File System** | Saves vouchers into categorized text files (`5php.txt`, `10php.txt`, etc.). |
| ⚙️ **Macro Generator** | Creates a ready-to-import `.macro` file for MacroDroid automation. |
| 🔗 **Webhook Integration** | Keeps MacroDroid updated with the latest voucher list. |
| 💳 **Payment Automation** | Works with GCash or Maya push notifications to issue vouchers automatically. |
| 📩 **MacroDroid Email Sync** | Tracks MacroDroid email confirmations and removes used vouchers from Drive files. |
| 🔄 **Sync & Maintenance** | “Force Update” option to rebuild or fix missing files. |
| 📱 **Responsive UI** | Optimized for both desktop and mobile GAS interfaces. |
| 🧾 **User Access Control** | Access limited through registered Gmail accounts. |

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

## 🔧 Setup Instructions

### 1️⃣ Prerequisites
- Google Account (Gmail, GDrive access)
- MacroDroid installed on your Android phone  
- GCash or Maya app with push notifications enabled  

---

### 2️⃣ GShareWiFi Dashboard Setup

Follow these steps to launch and set up your **GShareWiFi Voucher Manager**:

1. **Register your ShareWiFi Gmail account**  
   👉 [Click here to register](https://script.google.com/macros/s/AKfycbxbZAgrLUMo-Kqf0u3X1i9rKDqmiTUr6xZ9ArZmSEV2jpPpRHscSxsSBY3MrxxY36Gy/exec)

2. **Wait for approval**  
   You’ll receive an email once your account has been approved.

3. **Open your dashboard link**  
   The approval email includes your personal **GShareWiFi Voucher Manager** link.

4. **Complete the setup form**  
   Fill in the following details:
   - Your **registered ShareWiFi Gmail**
   - Your **WiFi Business Name**
   - Your **Voucher Amounts** (e.g., 5, 10, 20)
   - Your **Webhook URL** (see MacroDroid Setup below to obtain this)

5. **Click “🚀 Run Setup”**  
   The system will automatically generate a MacroDroid-compatible macro to handle your WiFi voucher automation.

---

✅ **Tip:**  
After setup, you can return to your dashboard anytime to **view, sync, or clear vouchers**.

---

### 3️⃣ MacroDroid Setup

1. From your **GShareWiFi Dashboard**, click:  
   **⬇️ Download Macro (Webhook URL Identifier)**  
   to download the ready-made `.macro` file.
2. Open **MacroDroid** on your Android device.
3. Import the downloaded `.macro` file.
4. **Long-press the macro → Test Actions**  
   Your **Webhook URL** will pop up.
5. **Copy** the Webhook URL and **paste it** into the **Webhook URL** field in your GShareWiFi dashboard form.

Once setup is complete, MacroDroid automatically communicates with your GShareWiFi system to update voucher files whenever new vouchers or payments are detected.

---

## 📲 How It Works with GCash / Maya

Once your MacroDroid automation is linked with GShareWiFi System:

1. A customer sends a payment via **GCash** or **Maya**.
2. **MacroDroid detects the push notification** (e.g., “You received ₱10 from...”).
3. GShareWiFi macro identifies the voucher that matches the payment amount (e.g., ₱10 → for `10php voucher`).
4. The system automatically sends a **WiFi voucher code via SMS** to the payer’s phone number.

💡 Example:  
A ₱20 payment → triggers push notification → checks amount & phone number → sends ₱20 WiFi voucher instantly via SMS.

With this setup, your WiFi vending system runs **fully automated**, 24/7 — no manual input required.

---

## 🖼️ UI Preview

![GShareWiFi Dashboard Screenshot](https://raw.githubusercontent.com/cleifwork/GSHAREWIFI/main/assets/img/GShareWiFiUI.png)

---

## 🎥 Demo Video

Watch how **GShareWiFi** automates voucher creation and SMS delivery in action:  

[![Watch the demo](https://raw.githubusercontent.com/cleifwork/GSHAREWIFI/main/assets/img/gsharewifi_play.png)](https://www.youtube.com/watch?v=YOUR_VIDEO_ID)

> 🎬 Click the image above or [watch directly on YouTube](https://www.youtube.com/watch?v=YOUR_VIDEO_ID)

---

## 🧱 Tech Stack

- **Google Apps Script (JavaScript)**
- **Google Drive & Gmail Services**
- **HTML, CSS, Vanilla JS (Frontend)**
- **MacroDroid (Android Automation)**

---

## 🛡️ License

This project is licensed under the **MIT License**.  
See [LICENSE](LICENSE) for details.

© 2025 **GConnect Solutions Inc.**

---

## 💬 Contact & Community

For updates, support, and community discussions:

- [📘 Facebook Group](https://www.facebook.com/groups/1776872022780742)  
- [▶️ YouTube Channel](https://www.youtube.com/channel/UC9O3ezuyjS7C6V7-ZAHCQrA)

---

**GShareWiFi — Automate your WiFi voucher business with Google Apps Script and MacroDroid.**


