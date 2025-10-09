// --- Configuration and Constants ---
const USER_SHEET_ID = '1geLoKR1i6Hb70GY-9ObvR8bHk--C_YgT5nXZqdEyvXQ'; // <-- your shared Google Sheet file
const SENDER_EMAIL = "no-reply@sharewifi.cc";
const EMAIL_SUBJECT = "Recharge card";
const UPDATE_EMAIL_SUBJECT_KEYWORD = "voucher update";

// CRITICAL CHANGE: This ID MUST point to the root 'macro_mod' folder in your Drive 
// containing 'temp.macro', 'action_1', and 'action_2'. 
// It is the SOURCE folder for copying to the user's account.
const MACRO_MOD_FOLDER_ID = '1jebNgaY1WFsMSdYK8Mh7H4wzuj2-XOuG'; // <-- REPLACE THIS WITH YOUR macro_mod FOLDER ID
const TEMP_MACRO_FILENAME = 'temp.macro';

// --- Multi-user Access Control ---

/**
 * Checks if the current user's Gmail is in the "AllowedUsers" sheet.
 */
// --- Multi-user Access Control with Cache ---
function isUserAllowed(token) {
  if (!token) return false;

  const ss = SpreadsheetApp.openById(USER_SHEET_ID);
  const sheet = ss.getSheetByName('AllowedUsers');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowToken = row[1];
    const active = String(row[4]).toLowerCase() === 'true' || row[4] === 1; // boolean normalization

    if (rowToken && rowToken === token && active) return true;
  }
  return false;
}

/**
 * Returns a list of allowed users from the sheet.
 * This will only be called if cache is empty or expired.
 */
function listAllowedUsers() {
  try {
    const ss = SpreadsheetApp.openById(USER_SHEET_ID);
    const sheet = ss.getSheetByName('AllowedUsers');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const users = [];
    for (let i = 1; i < data.length; i++) {
        const email = data[i][0];
        if (email) users.push(email.trim());
    }
    return users.sort();

  } catch (e) {
    Logger.log("Error listing allowed users: " + e.message);
    return [];
  }
}

/**
 * Gathers all initial user and configuration data needed by the HTML client
 * (email, saved business name, and saved webhook URL) in a single call.
 * This is faster and prevents race conditions in window.onload.
 */
function getInitialData() {
  const userProps = PropertiesService.getUserProperties();
  
  // Read all required properties
  const email = Session.getActiveUser().getEmail();
  const businessName = userProps.getProperty('BUSINESS_NAME') || '';
  const webhookUrl = userProps.getProperty('WEBHOOK_URL') || '';
  const amounts = userProps.getProperty('VOUCHER_AMOUNTS') || '';
  
  // CRITICAL FIX: Read the persistent switch state
  const forceMacroUpdate = userProps.getProperty('FORCE_UPDATE_SWITCH') === 'true'; 
  
  return {
    email: email,
    businessName: businessName,
    webhookUrl: webhookUrl,
    amounts: amounts,
    forceMacroUpdate: forceMacroUpdate // Return switch state to client
  };
}

// --- Main Trigger Functions ---

/**
 * Main function to be triggered for ADDING new vouchers from emails.
 * The webhook URL is dynamic, passed via user input and stored in UserProperties.
 */
function processNewRechargeEmails() {
  let emailsWereProcessed = false;
  try {
    const scriptProps = PropertiesService.getUserProperties();
    const WEBHOOK_URL = scriptProps.getProperty("WEBHOOK_URL");
    const searchQuery = `subject:"${EMAIL_SUBJECT}" from:${SENDER_EMAIL} is:unread`;
    const threads = GmailApp.search(searchQuery);

    if (threads.length === 0) {
      Logger.log("No new 'Recharge card' emails found.");
      return;
    }

    Logger.log(`Found ${threads.length} new email thread(s) for adding vouchers.`);

    // ✅ FIX: destructure properly to get the Drive Folder object
    const { folder: driveFolder } = getOrCreateDriveFolder_(getBusinessName());
    
    // Create a map to collect all vouchers before writing to files
    const allVouchersByFile = {};

    threads.forEach(thread => {
      const messages = thread.getMessages();
      messages.forEach(message => {
        if (message.isUnread()) {
          Logger.log(`Processing ADD email: ${message.getSubject()} from ${message.getFrom()}`);
          const emailBody = message.getPlainBody();
          const vouchers = parseVouchersFromEmailBody_(emailBody);

          if (vouchers.length > 0) {
            vouchers.forEach(voucher => {
              const fileName = `${voucher.amount}php_vouchers.txt`;
              const contentToAppend = `ID:${voucher.id}_pwd:${voucher.pwd}`;
              
              if (!allVouchersByFile[fileName]) {
                allVouchersByFile[fileName] = new Set();
              }
              allVouchersByFile[fileName].add(contentToAppend);
            });
            message.markRead();
            Logger.log(`Successfully processed and marked email read: ${message.getSubject()}`);
            emailsWereProcessed = true;
          } else {
            Logger.log(`No vouchers found in email body for: ${message.getSubject()}. Leaving unread for review.`);
          }
        }
      });
    });

    // Write all collected vouchers to their respective files in a single pass
    for (const fileName in allVouchersByFile) {
      const contentArray = Array.from(allVouchersByFile[fileName]);
      writeVoucherToDriveFile(driveFolder, fileName, contentArray);
    }
    
    if (emailsWereProcessed && WEBHOOK_URL) {
      triggerWebhook_(WEBHOOK_URL);
    } else if (!WEBHOOK_URL) {
      Logger.log("Webhook URL not set, skipping webhook call.");
    } else {
      Logger.log("No new vouchers were added in this run, skipping webhook call.");
    }

  } catch (e) {
    Logger.log(`Error in processNewRechargeEmails: ${e.toString()}`);
  }
}

/**
 * Main function to be triggered for REMOVING used vouchers from emails.
 * Uses user's Gmail as the sender email.
 */
function processVoucherUpdates() {
  let updatesWereProcessed = false;
  try {
    const UPDATE_SENDER_EMAIL = getUserEmail();
    const searchQuery = `subject:${UPDATE_EMAIL_SUBJECT_KEYWORD} from:${UPDATE_SENDER_EMAIL} is:unread`;
    const threads = GmailApp.search(searchQuery);

    if (threads.length === 0) {
      Logger.log("No new 'voucher update' emails found.");
      return;
    }

    Logger.log(`Found ${threads.length} email thread(s) for voucher updates.`);

    // ✅ FIX: destructure to get Folder object
    const { folder: driveFolder } = getOrCreateDriveFolder_(getBusinessName());

    threads.forEach(thread => {
      const messages = thread.getMessages();
      messages.forEach(message => {
        if (message.isUnread()) {
          const subject = message.getSubject();
          Logger.log(`Processing UPDATE email: ${subject} from ${message.getFrom()}`);

          const voucherToRemove = message.getPlainBody().trim();
          if (!voucherToRemove) {
            Logger.log("Email body is empty. Cannot determine which voucher to remove. Marking as read.");
            message.markRead();
            return;
          }

          const prefixMatch = subject.match(/^(\d+php) voucher update/i);
          if (!prefixMatch) {
            Logger.log(`Invalid subject format: "${subject}". Expected format like '15php voucher update'. Marking as read.`);
            message.markRead();
            return;
          }

          const fileNamePrefix = prefixMatch[1].toLowerCase();
          const fileName = `${fileNamePrefix}_vouchers.txt`;

          const success = removeVoucherFromFile_(driveFolder, fileName, voucherToRemove);
          if (success) {
            updatesWereProcessed = true;
          }

          if (success) {
            message.markRead();
          } else {
            Logger.log("Failed to remove voucher. Leaving email unread for manual retry.");
          }
        }
      });
    });
  } catch (e) {
    Logger.log(`Error in processVoucherUpdates: ${e.toString()}`);
  }
}

// --- Web App and Interface Functions ---
function doGet(e) {
  try {
    const params = e.parameter;
    const action = (params.action || '').toLowerCase();
    const email = params.email || '';
    const register = (params.register || '').toLowerCase();
    const token = params.token || '';
    if (!isUserAllowed(token)) {
      return HtmlService.createHtmlOutput("❌ Access Denied or Token Invalid");
    }

    // --- Approval / Rejection ---
    if (action === 'approve' && email) {
      return HtmlService.createHtmlOutput(approveUser(email));
    }
    if (action === 'reject' && email) {
      return HtmlService.createHtmlOutput(rejectUser(email));
    }

    // --- Registration Page ---
    if (register === 'true') {
      Logger.log("doGet: Showing RegisterUI");
      return HtmlService.createHtmlOutputFromFile('RegisterUI')
        .setTitle('Register - GShareWiFi Voucher Manager')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // --- Token Access Check ---
    if (!token || !isValidToken(token)) {
      const baseUrl = ScriptApp.getService().getUrl();
      const registerUrl = `${baseUrl}?register=true`;
      Logger.log("doGet: Invalid or missing token, redirecting to " + registerUrl);
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script>
              setTimeout(() => location.href='${registerUrl}', 2000);
            </script>
          </head>
          <body style="font-family:sans-serif;text-align:center;padding:40px">
            <h2>Checking your access…</h2>
            <p>Redirecting to registration page shortly.</p>
          </body>
        </html>`;
      return HtmlService.createHtmlOutput(html)
        .setTitle('Access Verification')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // --- Default Dashboard ---
    Logger.log("doGet: Loading dashboard for valid token");
    return HtmlService.createHtmlOutputFromFile('GShareWiFiUI')
      .setTitle('GShareWiFi Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (err) {
    Logger.log("doGet ERROR: " + err);
    return HtmlService.createHtmlOutput("<pre>Error in doGet: " + err + "</pre>");
  }
}

/**
 * Checks if a given token exists in the AllowedUsers sheet
 * and has not expired (optional).
 */
function isValidToken(token) {
  try {
    const ss = SpreadsheetApp.openById(USER_SHEET_ID);
    const sheet = ss.getSheetByName('AllowedUsers');
    if (!sheet) return false;

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i]; // <-- add this line
      const rowToken = String(row[1] || '').trim();
      if (rowToken && rowToken === token && row[4] === true) return true;
    }
    return false;
  } catch (e) {
    Logger.log("Error validating token: " + e);
    return false;
  }
}

/**
 * Lists all voucher files and the macro file in the user's Drive folder.
 * Returns an array of objects with name, id, count, and type indicators.
 */
function listVoucherFiles() {
  try {
    const businessName = getBusinessName();
    if (!businessName) {
      Logger.log("listVoucherFiles: Business name not set yet.");
      return [];
    }

    // Updated to use .folder from the new getOrCreateDriveFolder_()
    const { folder } = getOrCreateDriveFolder_(businessName);
    const files = folder.getFiles();
    const voucherFileData = [];
    let macroFileFound = false;

    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      const fileData = { 
        name, 
        id: file.getId(), 
        isVoucher: false, 
        isMacro: false, 
        count: 0 
      };

      if (name.toLowerCase().endsWith('php_vouchers.txt')) {
        fileData.isVoucher = true;

        // Read voucher file and count non-empty lines unless CLEARED
        const content = file.getBlob().getDataAsString("UTF-8");
        if (!content.includes("CLEARED") && content.trim() !== "") {
          fileData.count = content
            .trim()
            .split(/\r?\n/)
            .filter(line => line.trim()).length;
        }

        voucherFileData.push(fileData);

      } else if (name === 'GShareWiFi.macro') {
        fileData.isMacro = true;
        voucherFileData.push(fileData);
        macroFileFound = true;
      }
    }

    // Sort voucher files by amount numerically (e.g., 10php, 20php...)
    voucherFileData.sort((a, b) => {
      if (a.isMacro && !b.isMacro) return -1; // Macro always first
      if (!a.isMacro && b.isMacro) return 1;
      if (a.isVoucher && b.isVoucher) {
        const amountA = parseInt(a.name.match(/^(\d+)\s*php/i)?.[1] || 0);
        const amountB = parseInt(b.name.match(/^(\d+)\s*php/i)?.[1] || 0);
        return amountA - amountB;
      }
      return 0;
    });

    Logger.log(`Listed ${voucherFileData.length} files (macro found: ${macroFileFound})`);
    return voucherFileData;

  } catch (e) {
    if (e.message.includes("Business name is required")) {
      Logger.log("listVoucherFiles: Business name missing, returning empty list.");
      return [];
    }
    Logger.log(`Error listing voucher files: ${e.toString()}`);
    return [];
  }
}

// Get content of a voucher file (used in the UI)
function getVoucherFileContent(filename, businessName) {
  if (!businessName) {
    throw new Error(`Cannot read voucher file: businessName parameter is missing.`);
  }
  
  try {
    // Now getOrCreateDriveFolder_ receives the required businessName
    const { folder } = getOrCreateDriveFolder_(businessName);
    const files = folder.getFilesByName(filename);
    
    if (!files.hasNext()) {
      throw new Error(`File "${filename}" not found.`);
    }

    const file = files.next();
    // Use the safer readFileContentIfExists helper you provided
    const content = readFileContentIfExists(file);
    
    return content ? content : "(This file is empty.)";
    
  } catch (e) {
    // Enhanced error message to make debugging easier
    throw new Error(`Error reading file ${filename} for business "${businessName}": ${e.message}`);
  }
}

// Clear a specific voucher file
function clearSpecificVoucherFile(filename) {
  try {
    const { folder } = getOrCreateDriveFolder_(businessName);
    const files = folder.getFilesByName(filename);
    if (files.hasNext()) {
      const file = files.next();
      const currentContent = file.getBlob().getDataAsString("UTF-8");
      if (currentContent.includes("CLEARED")) {
        return `Skipped: ${filename} is already marked as CLEARED.`;
      }
      const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
      file.setContent(`CLEARED - ${timestamp}`);
      return `Successfully cleared ${filename}.`;
    } else {
      return `Error: File "${filename}" not found.`;
    }
  } catch (e) {
    return `Error clearing ${filename}: ${e.message}`;
  }
}

// Clear all voucher files
function clearAllVoucherFiles() {
  let clearedCount = 0, skippedCount = 0, errorCount = 0;
  try {
    const { folder } = getOrCreateDriveFolder_(businessName);
    const files = folder.getFiles();
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
    let foundVoucherFiles = false;
    while (files.hasNext()) {
      let file = files.next();
      const fileName = file.getName();
      if (fileName.toLowerCase().endsWith('php_vouchers.txt')) {
        foundVoucherFiles = true;
        try {
          const currentContent = file.getBlob().getDataAsString("UTF-8");
          if (currentContent.includes("CLEARED")) {
            skippedCount++;
            continue;
          }
          file.setContent(`CLEARED - ${timestamp}`);
          clearedCount++;
        } catch (e) {
          errorCount++;
        }
      }
    }
    if (!foundVoucherFiles) return "No voucher files found to clear.";
    let summary = `Operation complete. Cleared: ${clearedCount}. Skipped: ${skippedCount}.`;
    if (errorCount > 0) summary += ` Errors: ${errorCount}.`;
    return summary;
  } catch (e) {
    return `An overall error occurred: ${e.message}`;
  }
}

// --- Helper and Utility Functions ---
function removeVoucherFromFile_(folder, fileName, voucherToRemove) {
  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) return false;
  const file = files.next();
  const lines = file.getBlob().getDataAsString("UTF-8").split(/\r?\n/).map(l => l.trim()).filter(l => l);
  const index = lines.indexOf(voucherToRemove);
  if (index > -1) {
    lines.splice(index, 1);
    file.setContent(lines.join("\n"));
    return true;
  }
  return false;
}

function parseVouchersFromEmailBody_(body) {
  const vouchers = [];
  const regex = /ID:\s*([^\s\n]+)\s*pwd:\s*([^\s\n]+)\s*(\d+)\s*PHP/gi;
  let match;
  while ((match = regex.exec(body)) !== null) {
    vouchers.push({ id: match[1].trim(), pwd: match[2].trim(), amount: match[3].trim() });
  }
  return vouchers;
}

// --- Folder Utility ---
function getOrCreateDriveFolder_(businessName) {
  // Always use the persisted business name if it's available and an explicit name isn't provided
  const effectiveName = businessName || getBusinessName();
  if (!effectiveName) throw new Error("Business name is required to create Drive folder.");

  const folders = DriveApp.getFoldersByName(effectiveName);
  const folderExists = folders.hasNext();

  Logger.log(`Folder '${effectiveName}' exists: ${folderExists}`);

  if (folderExists) {
    const existing = folders.next();
    Logger.log(`Using existing folder: ${effectiveName} (ID: ${existing.getId()})`);
    return { folder: existing, exists: true };
  }

  const newFolder = DriveApp.createFolder(effectiveName);
  Logger.log(`Created new folder: ${effectiveName} (ID: ${newFolder.getId()})`);
  return { folder: newFolder, exists: false };
}

function getDriveFolderOnly_(businessName) {
  const { folder } = getOrCreateDriveFolder_(businessName);
  return folder;
}

// --- Voucher File Write Utility ---
function writeVoucherToDriveFile(folder, fileName, contentToAppendArray) {
  const files = folder.getFilesByName(fileName);
  let file;

  if (files.hasNext()) {
    file = files.next();
    // Read the file content once
    const existingContent = file.getBlob().getDataAsString("UTF-8");

    if (existingContent.includes("CLEARED")) {
      // If cleared, just replace content with new vouchers
      file.setContent(contentToAppendArray.join("\n"));
    } else {
      // Append new vouchers, avoiding duplicates
      const lines = existingContent.split(/\r?\n/).map(l => l.trim()).filter(l => l);
      const linesSet = new Set(lines);
      contentToAppendArray.forEach(line => linesSet.add(line));
      
      // Write the content back in a single operation
      file.setContent(Array.from(linesSet).join("\n"));
    }
  } else {
    // File doesn't exist, create it with all new vouchers
    file = folder.createFile(fileName, contentToAppendArray.join("\n"));
  }
  setFileSharing_(file);
}

function setFileSharing_(file) {
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } 
  catch (e) { Logger.log(e); }
}

// Trigger webhook dynamically
function triggerWebhook_(url) {
  try { UrlFetchApp.fetch(url, { method: "GET", muteHttpExceptions: true }); } 
  catch (e) { Logger.log(e); }
}

// --- User Setup Functions ---
function getUserEmail() { return Session.getActiveUser().getEmail(); }

// Updated User Setup Functions
function setupUserVoucherFiles(data) {
  try {
    if (!data || !data.businessName) throw new Error("Business name missing in setupUserVoucherFiles.");
    
    const { folder } = getOrCreateDriveFolder_(data.businessName);
    const amounts = Array.isArray(data.amounts) ? data.amounts : [];
    const WEBHOOK_URL = data.webhookUrl;

    PropertiesService.getUserProperties().setProperty("WEBHOOK_URL", WEBHOOK_URL);

    Logger.log(`📂 Setting up voucher files for: ${data.businessName}, Amounts: ${amounts.join(", ")}`);

    if (amounts.length === 0) {
      Logger.log("⚠️ No voucher amounts provided, skipping file creation.");
      return { success: false, message: "No voucher amounts provided.", files: [] };
    }

    // Cache existing files
    const existingFiles = {};
    const filesIterator = folder.getFiles();
    while (filesIterator.hasNext()) {
      const file = filesIterator.next();
      existingFiles[file.getName()] = file;
    }

    const result = [];
    for (const amount of amounts) {
      const fileName = `${amount}php_vouchers.txt`;
      let file = existingFiles[fileName];

      if (!file) {
        file = folder.createFile(fileName, "");
        Logger.log(`🆕 Created new voucher file: ${fileName}`);
      } else {
        Logger.log(`✅ Found existing voucher file: ${fileName}`);
      }

      setFileSharing_(file);
      result.push({ amount, id: file.getId(), url: file.getUrl() });
    }

    return { success: true, message: `Folder & voucher files ready for ${data.businessName}`, files: result };
  } catch (e) {
    Logger.log(`❌ setupUserVoucherFiles error: ${e}`);
    return { success: false, message: e.message, files: [] };
  }
}

function getBusinessName() {
  const props = PropertiesService.getUserProperties();
  return props.getProperty("businessName") || null;
}

function saveBusinessName(name) {
  PropertiesService.getUserProperties().setProperty("businessName", name);
  return `Business name saved: ${name}`;
}

/**
 * Saves the provided webhook URL to the ScriptProperties for persistent use.
 * This is specific to the currently running script instance.
 * @param {string} url The webhook URL to save.
 */
function saveWebhookUrl(url) {
  if (url) {
    PropertiesService.getScriptProperties().setProperty('SAVED_WEBHOOK_URL', url);
  }
}

// Original simple setup function (kept for completeness, though likely replaced by the macro version)
function setupGShareWiFi(businessName, amounts, webhookUrl) {
  saveBusinessName(businessName);
  const result = setupUserVoucherFiles({ businessName, amounts, webhookUrl });
  return result.message;
}

/**
 * Saves the state of the Force Update switch (ON/OFF) in user properties.
 * @param {boolean} newState - True if forced update is ON.
 */
function saveForceUpdateSwitchState(newState) {
  PropertiesService.getUserProperties().setProperty('FORCE_UPDATE_SWITCH_STATE', String(newState));
  Logger.log('Saved FORCE_UPDATE_SWITCH_STATE: ' + newState);
}

/**
 * Retrieves the saved Force Update switch state.
 * Defaults to false if not set.
 */
function getForceUpdateSwitchState() {
  const userProps = PropertiesService.getUserProperties();
  const state = userProps.getProperty('FORCE_UPDATE_SWITCH_STATE');
  return state === 'true';
}

/**
 * Replace all occurrences of a string within another string.
 * @param {string} str The string to modify.
 * @param {string} find The substring to find.
 * @param {string} replace The replacement string.
 * @returns {string} The modified string.
 */
function replaceAllStr(str, find, replace) {
  if (typeof str !== 'string' || typeof find !== 'string' || typeof replace !== 'string') {
    Logger.log('replaceAllStr: Invalid argument type.');
    return str; // Return original if types are wrong
  }
  return str.split(find).join(replace);
}

/**
 * Safely read file content as UTF-8, handling potential encoding issues.
 * @param {GoogleAppsScript.Drive.File} file The Drive File object.
 * @returns {string|null} The file content as a string, or null on failure.
 */
function readFileContentIfExists(file) {
  if (!file) {
    Logger.log('readFileContentIfExists: File object is null.');
    return null;
  }
  try {
    // Force UTF-8 encoding reading to handle MacroDroid JSON files properly
    const content = file.getBlob().getDataAsString('UTF-8');
    if (!content) {
      Logger.log(`readFileContentIfExists: File ${file.getName()} content is empty.`);
      return null;
    }
    return content;
  } catch (e) {
    Logger.log(`readFileContentIfExists error for file ${file.getName()}: ` + e);
    return null;
  }
}

/**
 * Recursively copies a source folder (including all its files and subfolders) 
 * to a target destination folder.
 * * @param {GoogleAppsScript.Drive.Folder} sourceFolder The Drive Folder object to copy.
 * @param {GoogleAppsScript.Drive.Folder} targetFolder The folder where the copy will reside.
 * @returns {GoogleAppsScript.Drive.Folder} The newly created top-level copied folder.
 */
function copyDriveFolderRecursive(sourceFolder, targetFolder) {
  // 1. Create the new folder inside the target
  const newFolder = targetFolder.createFolder(sourceFolder.getName());
  Logger.log(`Creating new folder: ${newFolder.getName()} (ID: ${newFolder.getId()})`);

  // 2. Copy all files directly inside the source folder
  const files = sourceFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    file.makeCopy(newFolder); 
    Logger.log(`   Copied file: ${file.getName()}`);
  }

  // 3. Recursively copy all subfolders
  const subfolders = sourceFolder.getFolders();
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    copyDriveFolderRecursive(subfolder, newFolder);
  }

  return newFolder;
}

/**
 * Replaces the original copy function. 
 * Handles cleaning up old folders and initiating the recursive copy of the 
 * entire macro_mod structure (including action_1 and action_2 subfolders).
 * * @param {string} sourceFolderId The ID of the macro_mod folder template (e.g., MACRO_MOD_FOLDER_ID).
 * @param {GoogleAppsScript.Drive.Folder} userFolder The user's main folder where the copy should go.
 * @returns {GoogleAppsScript.Drive.Folder | null} The copied macro_mod folder or null on failure.
 */
function copyMacroModToUserFolder(sourceFolderId, userFolder, forceCopy = false) {
  try {
    const sourceFolder = DriveApp.getFolderById(sourceFolderId);
    const sourceFolderName = sourceFolder.getName();
    
    // Check for existing folder
    let existingFolders = userFolder.getFoldersByName(sourceFolderName);
    let existingFolder = existingFolders.hasNext() ? existingFolders.next() : null;

    // 1️⃣ SKIP LOGIC: Folder exists and no force update is requested
    if (existingFolder && !forceCopy) {
      Logger.log(`Skipping copy. '${sourceFolderName}' already exists. Use 'Force Update' to refresh.`);
      return existingFolder; // Return it as-is
    }

    // 2️⃣ FORCE COPY / INITIAL COPY LOGIC
    if (existingFolder && forceCopy) {
      Logger.log(`Found old '${sourceFolderName}'. Force update requested. Removing old copy...`);
      existingFolder.setTrashed(true);
    }

    Logger.log(`Starting recursive copy of folder: ${sourceFolderName}`);
    const newCopiedFolder = copyDriveFolderRecursive(sourceFolder, userFolder);
    Logger.log(`Successfully copied folder recursively to ID: ${newCopiedFolder.getId()}`);

    // ✅ 3️⃣ VALIDATE THAT TEMP_MACRO EXISTS IN THE NEWLY COPIED FOLDER
    const testFile = newCopiedFolder.getFilesByName(TEMP_MACRO_FILENAME);
    if (!testFile.hasNext()) {
      Logger.log(`⚠️ Warning: ${TEMP_MACRO_FILENAME} missing after copy. Template source may be incomplete.`);
    } else {
      Logger.log(`✅ Verified: ${TEMP_MACRO_FILENAME} found in copied folder.`);
    }

    return newCopiedFolder;

  } catch (e) {
    Logger.log(`❌ Error during conditional folder copy: ${e}`);
    return null;
  }
}

/**
 * Deletes all template files and subfolders inside the user's 'macro_mod' folder,
 * while keeping the folder itself intact. Used during Force Template Update.
 *
 * @param {GoogleAppsScript.Drive.Folder} userFolder - The user's main folder (e.g., GShareWiFi for that business)
 * @returns {boolean} True if cleared successfully, false otherwise.
 */
function deleteUserTempFiles(userFolder) {
  try {
    if (!userFolder || typeof userFolder.getFoldersByName !== 'function') {
      Logger.log("❌ deleteUserTempFiles: Invalid or null userFolder.");
      return false;
    }

    const targetName = "macro_mod";
    const subfolders = userFolder.getFoldersByName(targetName);
    if (!subfolders.hasNext()) {
      Logger.log(`⚠️ deleteUserTempFiles: No '${targetName}' folder found inside user folder.`);
      return false;
    }

    const macroModFolder = subfolders.next();
    Logger.log(`🧹 Clearing contents of '${targetName}' (ID: ${macroModFolder.getId()})`);

    // Delete files
    const files = macroModFolder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      Logger.log(`🗑️ Deleting file: ${file.getName()}`);
      file.setTrashed(true);
    }

    // Delete subfolders
    const subfoldersInMacro = macroModFolder.getFolders();
    while (subfoldersInMacro.hasNext()) {
      const sub = subfoldersInMacro.next();
      Logger.log(`🗂️ Deleting subfolder: ${sub.getName()}`);
      sub.setTrashed(true);
    }

    Logger.log(`✅ deleteUserTempFiles: Finished clearing '${targetName}' folder.`);
    return true;

  } catch (e) {
    Logger.log(`❌ deleteUserTempFiles error: ${e}`);
    return false;
  }
}

// ------------------------------
// Macro generation for users
// ------------------------------

/**
 * Generate the GShareWiFi.macro for the current user using:
 * - user's local temp.macro (inside macroModFolder)
 * - user's local macro_mod/action_1 and action_2 snippet files
 * - user-provided amounts (array of integers or strings) and user's gmail
 *
 * @param {string} businessName The name of the user's Drive folder.
 * @param {Array<number|string>} amounts Array of voucher amounts (must be sorted).
 * @param {string} gmail The user's email address.
 * @param {Array<string>} fileIds The Drive IDs of the voucher files, sorted by amount.
 * @param {GoogleAppsScript.Drive.Folder} macroModFolder The user's local copy of the macro_mod folder.
 * @returns {object} { success: boolean, message: string, fileId?: string, url?: string }
 */
function generateUserMacroForUser(businessName, amounts, gmail, fileIds, macroModFolder) {
  try {
    Logger.log('generateUserMacroForUser start - business:' + businessName + ' amounts count:' + amounts.length + ' gmail:' + gmail);

    // Basic validation
    if (!businessName || !amounts || !Array.isArray(amounts) || amounts.length === 0 || !gmail || 
        !fileIds || !Array.isArray(fileIds) || fileIds.length === 0 || fileIds.length !== amounts.length ||
        !macroModFolder) {
      Logger.log(`Validation failed. macroModFolder valid: ${!!macroModFolder}. lengths: ${amounts ? amounts.length : 'null'}, ${fileIds ? fileIds.length : 'null'}`);
      return { success: false, message: 'Missing businessName, amounts, gmail, fileIds mismatch, or macroModFolder not provided/invalid.' };
    }

    if (!macroModFolder || typeof macroModFolder.getFilesByName !== 'function') {
      Logger.log(`❌ Invalid macroModFolder object received: ${JSON.stringify(macroModFolder)}`);
      return { success: false, message: 'Invalid macroModFolder — expected a Drive folder object.' };
    }

    // Normalize amounts -> strings (no whitespace)
    const amountsArr = amounts.map(a => String(a).trim()).filter(a => a);
    if (amountsArr.length !== amounts.length) {
       Logger.log(`Validation failed after trimming. Original length: ${amounts.length}, Trimmed length: ${amountsArr.length}`);
       return { success: false, message: 'Amounts array contained invalid/empty entries after trimming.' };
    }

    const numAmounts = amountsArr.length; // Use this variable for all dynamic checks

    // 1) Read template file (temp.macro) from the user's local copy (macroModFolder)
    const tempFileIter = macroModFolder.getFilesByName(TEMP_MACRO_FILENAME);
    if (!tempFileIter.hasNext()) {
      Logger.log('Could not find temp.macro in user copy.');
      return { success: false, message: `Template (${TEMP_MACRO_FILENAME}) not found in the copied macro_mod folder.` };
    }
    const tempFile = tempFileIter.next();

    // Use the fixed helper for reading content
    let modifiedContent = readFileContentIfExists(tempFile);
    if (modifiedContent === null) {
      return { success: false, message: `Failed to read ${TEMP_MACRO_FILENAME} content.` };
    }

    Logger.log('Loaded temp.macro content length: ' + modifiedContent.length);
    
    // 2. String patterns equivalent to Python
    const s_rcvamt_string = '","variable":{"textValue":"received PHP 0.00'; // Now includes .00
    const r_rcvamt_string = '","variable":{"textValue":"received PHP ';
    const s_rcvmya_string = '","variable":{"textValue":"received ₱0.00'; // Now includes .00
    const r_rcvmya_string = '","variable":{"textValue":"received ₱';
    const s_vamtx_string = '","variable":{"textValue":"Here is your '; // Matches your Python's s_vamtx_string (no '0' placeholder)
    
    const key_string = '{"key":"PHP0'; // Used in loop
    const vcodkey_string = '{"key":"VCOD_0'; // Used in loop

    // FULL STRINGS (Renamed consistently to prevent shadowing/conflicts)
    const rcvamt_full_string = '","variable":{"textValue":"received PHP 0.00","variableType":2,"type":"StringValue"},"variableType":11,"type":"DictionaryEntry"}'; 
    const rcvmya_full_string = '","variable":{"textValue":"received ₱0.00","variableType":2,"type":"StringValue"},"variableType":11,"type":"DictionaryEntry"}'; 
    // FIXED: Ensures \n is represented as literal backslash-n, matching MacroDroid's JSON export.
    const vamtx_full_string = '","variable":{"textValue":"Here is your PHP voucher\\n","variableType":2,"type":"StringValue"},"variableType":11,"type":"DictionaryEntry"}'; 
    const vchcd_string = '","variable":{"textValue":"","variableType":2,"type":"StringValue"},"variableType":11,"type":"DictionaryEntry"}'; 

    // 1.5) IMPORTANT: Replace placeholders with actual file IDs (in order of amounts)
    const fileIdPlaceholder = "PASTE_FILE_ID_HERE";
    let replaceCount = 0;
    
    // Loop ONLY for the number of file IDs provided (numAmounts)
    for (let i = 0; i < numAmounts; i++) {
      const file_id = fileIds[i];

      // Replace only the FIRST occurrence for each ID, ensuring sequential insertion.
      const prevContentLength = modifiedContent.length;
      modifiedContent = modifiedContent.replace(fileIdPlaceholder, file_id); 
      
      if (modifiedContent.length !== prevContentLength) {
        replaceCount++;
      } else {
        Logger.log(`CRITICAL ERROR: Failed to replace Placeholder ${replaceCount + 1} with ID ${file_id}. Placeholder not found.`);
        return { success: false, message: `CRITICAL ERROR: Failed to replace Placeholder #${replaceCount + 1} of ${numAmounts}. Template mismatch detected.` };
      }
    }
    
    Logger.log(`Successfully replaced ${replaceCount} file ID placeholders. Expected: ${numAmounts}.`);

    // 1.6) CRITICAL CHECK: Check how many file ID placeholders remain.
    const totalPlaceholdersInTemplate = 9;
    const expectedRemaining = totalPlaceholdersInTemplate - numAmounts;
    const actualRemaining = (modifiedContent.match(new RegExp(fileIdPlaceholder, 'g')) || []).length;
    
    if (actualRemaining !== expectedRemaining) {
        Logger.log(`Error: Template contains ${actualRemaining} placeholders, expected exactly ${expectedRemaining}. Template mismatch detected.`);
        // We return an error if the remaining count is NOT exactly what is expected.
        return { success: false, message: `Failed to insert file IDs. Template mismatch detected. Expected exactly ${expectedRemaining} remaining placeholders, found ${actualRemaining}.` };
    }
    
    // 2) Build replacement maps
    const voucherAmounts = amountsArr.slice(); // copy

    // Replacement map 1: Full content/price value replacements (MUST run first)
    const fullContentReplacements = {};
    // Replacement map 2: Small variable name replacements (MUST run second)
    const variableNameReplacements = {};

    const amountIds = [];

    // Loop through all 9 possible placeholders (i=1 to 9)
    for (let idx = 1; idx <= 9; idx++) {
      
      const isUsed = idx <= numAmounts; // Determine usage based on the actual number of files
      const price = isUsed ? voucherAmounts[idx - 1] : null;

      if (isUsed) {
        amountIds.push(price); // Only push if the price is used
      }
      
      // Calculate the FIND strings (always based on the static template)
      const find_rcvamt = `${key_string}${idx}${s_rcvamt_string}`;
      const find_rcvmya = `${key_string}${idx}${s_rcvmya_string}`;
      const find_vamtx = `${key_string}${idx}${s_vamtx_string}`;
      
      if (isUsed) {
        // --- CASE 1: Used Placeholder (Perform Replacement) ---
        
        // --- PASS 1: Full Content/Price Value Replacements (Relies on finding PHP0i) ---
        // Adds the price and .00 to the dictionary value
        const replace_rcvamt = `${key_string}${idx}${r_rcvamt_string}${price}.00`;
        fullContentReplacements[find_rcvamt] = replace_rcvamt;
        
        const replace_rcvmya = `${key_string}${idx}${r_rcvmya_string}${price}.00`;
        fullContentReplacements[find_rcvmya] = replace_rcvmya;
        
        // Adds the price to the dictionary value text
        const replace_vamtx = `${key_string}${idx}${s_vamtx_string}${price}`;
        fullContentReplacements[find_vamtx] = replace_vamtx;

        // --- PASS 2: Generic Variable Name Replacements (Changes PHP0i to PHP{price}) ---
        variableNameReplacements[`VCOD_0${idx}`] = `VCOD_${price}`;
        variableNameReplacements[`0${idx}PHP`] = `${price}PHP`;
        variableNameReplacements[`0${idx}php`] = `${price}php`; // for email subject
        variableNameReplacements[`PHP0${idx}`] = `PHP${price}`; 

      } else {
        // --- CASE 2: Unused Placeholder (Map to Itself) ---
        
        // PASS 1 retention (The find string remains the replace string)
        fullContentReplacements[find_rcvamt] = find_rcvamt;
        fullContentReplacements[find_rcvmya] = find_rcvmya;
        fullContentReplacements[find_vamtx] = find_vamtx;

        // PASS 2 retention
        variableNameReplacements[`VCOD_0${idx}`] = `VCOD_0${idx}`;
        variableNameReplacements[`0${idx}PHP`] = `0${idx}PHP`;
        variableNameReplacements[`0${idx}php`] = `${price}php`; // for email subject
        variableNameReplacements[`PHP0${idx}`] = `PHP0${idx}`;
      }
    }

    // 3) Replace the "(1|2|...)" price group inside the template (regex)
    if (amountIds.length > 0) {
      // Update the pattern "(?:\d+\|?)+" with new group like (10|20|50)
      const newGroup = '(' + amountIds.join('|') + ')';
      // Use regex with global flag
      try {
        // Find the pattern that matches existing amount groups (e.g., (1|2|5|10))
        modifiedContent = modifiedContent.replace(/\((?:\d+\|?)+\)/g, newGroup);
        Logger.log('Regex group replacement complete.');
      } catch (e) {
        Logger.log('Regex replace group error: ' + e);
      }
    }

    // 4) Read action snippet files from action_1 and action_2 subfolders and remove their contents
    // We will look for subfolders named 'action_1' and 'action_2' inside the provided macroModFolder
    const subFolders = macroModFolder.getFolders();
    let action1Folder = null, action2Folder = null;
    while (subFolders.hasNext()) {
      const f = subFolders.next();
      const fname = f.getName().toLowerCase();
      if (fname === 'action_1') action1Folder = f;
      if (fname === 'action_2') action2Folder = f;
    }

    // Helper: read snippet by name from a folder (returns text or null)
    function readSnippet(folder, snippetName) {
      if (!folder) return null;
      const it = folder.getFilesByName(snippetName);
      if (it.hasNext()) {
        return readFileContentIfExists(it.next());
      }
      return null;
    }

    // Create a working temp var
    let modifiedContentTemp = modifiedContent;

    // We'll run from loop_stopped = (lastUsedIndex + 1) up to 9
    let loopStopped = (numAmounts >= 1 ? numAmounts + 1 : 1);

    // If loopStopped is less than 1, set to 1
    if (loopStopped < 1) loopStopped = 1;

    // Do loop until 9 (inclusive equivalent)
    while (loopStopped < 10) {
      const idxStr = String(loopStopped);

      // snippet file names expected: e_php_{n}.macro and e_vcod_{n}.macro
      const snippetPhpName = `e_php_${idxStr}.macro`;
      const snippetVcodName = `e_vcod_${idxStr}.macro`;

      // Try to remove snippet content by reading snippet files (action1Folder/action2Folder)
      const phpSnippet = readSnippet(action1Folder, snippetPhpName);
      const vcodSnippet = readSnippet(action2Folder, snippetVcodName);

      if (phpSnippet) {
        // replace occurrences of the exact snippet content with empty string
        modifiedContentTemp = replaceAllStr(modifiedContentTemp, phpSnippet, '');
      }
      if (vcodSnippet) {
        // replace occurrences of the exact snippet content with empty string
        modifiedContentTemp = replaceAllStr(modifiedContentTemp, vcodSnippet, '');
      }

      // Construct some patterns from python logic
      try {
        if (loopStopped === 9) {
          // remove patterns with a leading comma (end part)
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `,${key_string}${idxStr}${rcvamt_full_string}`, '');
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `,${key_string}${idxStr}${rcvmya_full_string}`, '');
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `,${key_string}${idxStr}${vamtx_full_string}`, '');
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `,${vcodkey_string}${idxStr}${vchcd_string}`, '');
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `,${key_string}${idxStr}${vchcd_string}`, '');
        } else {
          // remove patterns with trailing comma
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `${key_string}${idxStr}${rcvamt_full_string},`, '');
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `${key_string}${idxStr}${rcvmya_full_string},`, '');
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `${key_string}${idxStr}${vamtx_full_string},`, '');
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `${vcodkey_string}${idxStr}${vchcd_string},`, '');
          modifiedContentTemp = replaceAllStr(modifiedContentTemp, `${key_string}${idxStr}${vchcd_string},`, '');
        }
      } catch (e) {
        Logger.log('Error while cleaning keyed patterns for index ' + idxStr + ' : ' + e);
      }

      loopStopped += 1;
    } // end while

    // Assign back
    modifiedContent = modifiedContentTemp;
    Logger.log('Content cleanup complete.');

    // 5) Apply the replacements map in the correct sequence (replace ALL occurrences of each placeholder)
    
    // PASS 1: Apply full content replacements. Must run first to find the original PHP0i key.
    for (var placeholder in fullContentReplacements) {
      if (fullContentReplacements.hasOwnProperty(placeholder)) {
        const rep = fullContentReplacements[placeholder];
        modifiedContent = replaceAllStr(modifiedContent, placeholder, rep);
      }
    }
    Logger.log('Pass 1 replacements complete.');

    // PASS 2: Apply variable name replacements. Must run last to rename PHP0i keys.
    for (var placeholder in variableNameReplacements) {
      if (variableNameReplacements.hasOwnProperty(placeholder)) {
        const rep = variableNameReplacements[placeholder];
        modifiedContent = replaceAllStr(modifiedContent, placeholder, rep);
      }
    }
    Logger.log('Pass 2 replacements complete.');

    // 6) Replace Gmail placeholder (all occurrences)
    modifiedContent = replaceAllStr(modifiedContent, 'YOUR_EMAIL_HERE@gmail.com', gmail);

    // 6.1) Replace WiFi name placeholder if BusinessName is available
    if (businessName && businessName.trim() !== '') {
      modifiedContent = replaceAllStr(modifiedContent, 'WIFINAME', businessName.trim());
    }

    // 7) Save the output into the user's Drive under their GSHAREWIFI folder
    const { folder: userFolder } = getOrCreateDriveFolder_(businessName);
    const outFileName = 'GShareWiFi.macro';
    const existing = userFolder.getFilesByName(outFileName);

    let outFile;
    if (existing.hasNext()) {
      outFile = existing.next();
      Logger.log('Updating existing macro file ID: ' + outFile.getId());
      outFile.setContent(modifiedContent);
    } else {
      Logger.log('Creating new macro file.');
      outFile = userFolder.createFile(outFileName, modifiedContent);
    }

    // Set sharing to anyone with link (same as your other files)
    try {
      outFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log('setSharing failed: ' + e);
    }

    Logger.log('Macro created: ' + outFile.getId());
    return { success: true, message: 'Macro generated successfully.', fileId: outFile.getId(), url: outFile.getUrl() };

  } catch (e) {
    Logger.log('generateUserMacroForUser error: ' + e);
    return { success: false, message: 'Unexpected error during macro generation: ' + e.toString() };
  }
}

/**
 * Sets up the user's Google Drive folders, files, and macro template.
 * @param {string} businessName - The name of the business.
 * @param {number[]} amounts - Array of voucher amounts.
 * @param {string} webhookUrl - The MacroDroid webhook URL.
 * @param {boolean} forceMacroUpdate - Flag to force deletion and recopy of the template folder.
 * @returns {object} - Success message/url or error message, including updatePerformed flag.
 */
function setupGShareWiFi_andGenerateMacro(businessName, amounts, webhookUrl, forceMacroUpdate) {
  const folderInfo = getOrCreateDriveFolder_(businessName);
  const userFolder = folderInfo.folder;
  const folderExists = folderInfo.exists;
  const gmail = Session.getActiveUser().getEmail();

  let updatePerformed = false;

  // Persist key properties
  const userProps = PropertiesService.getUserProperties();
  userProps.setProperties({
    'BUSINESS_NAME': businessName,
    'WEBHOOK_URL': webhookUrl,
    'VOUCHER_AMOUNTS': amounts.join(',')
  });

  // Handle force update logic
  if (folderExists && forceMacroUpdate) {
    deleteUserTempFiles(userFolder);
    updatePerformed = true;
    Logger.log(`Force update requested. Cleared existing template for ${businessName}.`);
  } else if (!folderExists) {
    updatePerformed = true;
  }

  // Ensure voucher files exist
  const existingFiles = listVoucherFiles(true);
  const existingAmounts = [];

  for (const file of existingFiles) {
    const match = file.name.match(/(\d+)\s*php_vouchers\.txt$/i);
    if (match) existingAmounts.push(parseInt(match[1], 10));
  }

  const mergedAmounts = [...new Set([...existingAmounts, ...amounts])]
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  Logger.log('Merged voucher amounts: ' + JSON.stringify(mergedAmounts));

  const result = setupUserVoucherFiles({ businessName, amounts: mergedAmounts, webhookUrl });
  if (!result.success) return { success: false, message: result.message, keepSwitchOn: true };

  // Copy macro_mod folder
  const macroModFolder = copyMacroModToUserFolder(MACRO_MOD_FOLDER_ID, userFolder, forceMacroUpdate);
  if (!macroModFolder) {
    return { success: false, message: "Failed to copy macro_mod folder.", keepSwitchOn: true };
  }

  // Validate template presence
  const tempFileCheck = macroModFolder.getFilesByName(TEMP_MACRO_FILENAME);
  if (!tempFileCheck.hasNext()) {
    return { success: false, message: `${TEMP_MACRO_FILENAME} missing from macro_mod folder.`, keepSwitchOn: true };
  }

  // Generate macro
  const validFiles = result.files.filter(f => f.id && f.amount); 
  const fileIds = validFiles.map(f => String(f.id).trim());
  const finalAmounts = validFiles.map(f => f.amount);
  const gen = generateUserMacroForUser(businessName, finalAmounts, gmail, fileIds, macroModFolder);

  if (!gen.success) {
    return {
      success: false,
      message: `Macro generation failed: ${gen.message}`,
      keepSwitchOn: true
    };
  }

  return {
    success: true,
    message: result.message + ' Macro created: ' + gen.url,
    keepSwitchOn: false // ✅ only turn OFF on total success
  };
}

/**
 * Returns a direct download URL for a Drive file (so client can open it in a new tab).
 */
function getMacroDownloadUrl(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    // Optional: make sure it’s accessible
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  } catch (e) {
    Logger.log("Error generating download URL for " + fileId + ": " + e.message);
    throw new Error("Could not retrieve file download link.");
  }
}
