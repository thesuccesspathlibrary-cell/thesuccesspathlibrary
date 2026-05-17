// If you deploy this as a standalone Apps Script, set SPREADSHEET_ID.
// If you bind it to a Google Sheet, you can leave SPREADSHEET_ID blank.
const LIBRARY_WEBAPP_CONFIG = {
  SPREADSHEET_ID: "",
  TIMEZONE: "Asia/Kolkata",
  API_KEY: "",
  CONTROL_SHEET_NAME: "Library_Control",
  DASHBOARD_SHEET_NAME: "Library_Dashboard",
  ACTIVE_STUDENTS_SHEET_NAME: "Active Students",
  SELECTED_STUDENTS_SHEET_NAME: "Selected Students",
  LEFT_STUDENTS_SHEET_NAME: "Left Students",
  STUDENTS_SHEET_NAME: "Library_Students",
  SEAT_HISTORY_SHEET_NAME: "Library_Seat_History",
  ADMIN_SETTINGS_SHEET_NAME: "Library_Admin",
  LOG_SHEET_NAME: "Library_Sync_Log",
  SNAPSHOT_SHEET_PREFIX: "Library_Snapshot_",
  SNAPSHOT_SLOTS: ["A", "B"],
  SNAPSHOT_CHUNK_SIZE: 45000,
  LOCK_TIMEOUT_MS: 45000,
  MAX_LOG_ROWS: 1000,
  DEFAULT_DRIVE_ROOT_FOLDER_ID: "",
  DEFAULT_DRIVE_FOLDER_NAME: "Library Student Images",
  DEFAULT_PHOTO_URL: "https://i.imgur.com/6VBx3io.png",
  DEFAULT_ADMIN_PANEL_PASSWORD: "2580",
  MASTER_ADMIN_RESET_KEY: "7209"
};
const LIBRARY_READABLE_STUDENT_CODE_PREFIX = "LIB";
const LIBRARY_READABLE_STUDENT_CODE_PAD = 4;
const LIBRARY_UI_CONTENT_RECORD_ID = "__attendance_ui_content__";
const LIBRARY_UI_CONTENT_RECORD_TYPE = "attendance_ui_content";

const LIBRARY_SYNC_STATUS_OK = "SYNC_OK";
const LIBRARY_SYNC_STATUS_CONFLICT = "REVISION_CONFLICT";
const LIBRARY_SYNC_STATUS_DELTA_UNSUPPORTED = "DELTA_UNSUPPORTED";
const LIBRARY_SYNC_STATUS_BUSY = "SYNC_BUSY";
const LIBRARY_SYNC_STATUS_ERROR = "SERVER_ERROR";
const LIBRARY_CONTROL_HEADERS = [
  "active_slot",
  "revision",
  "updated_at",
  "record_count",
  "checksum",
  "committed_at"
];
const LIBRARY_SNAPSHOT_META_HEADERS = [
  "slot",
  "revision",
  "updated_at",
  "record_count",
  "checksum",
  "saved_at"
];
const LIBRARY_STUDENT_HEADERS = [
  "Student ID",
  "Name",
  "Parent Name",
  "Seat",
  "Slot",
  "Time Start",
  "Time End",
  "Fee",
  "Fee Plan",
  "Admission",
  "Next Fee Date",
  "Status",
  "Attendance",
  "Mobile",
  "Parent Mobile",
  "Address Type",
  "Local Address",
  "Permanent Address",
  "Aadhar No",
  "Manual Serial No",
  "Locker No",
  "Goal",
  "Photo",
  "Deleted At",
  "Updated At",
  "Paid History JSON",
  "Attendance Source",
  "Last Attendance Date",
  "Last Attendance Time",
  "Last Payment Date",
  "Last Payment Amount",
  "Admission Mode",
  "Seat Status",
  "Seat Assigned At",
  "Seat Assigned By",
  "Seat History JSON"
];
const LIBRARY_SEAT_HISTORY_HEADERS = [
  "Event ID",
  "Student ID",
  "Manual Serial No",
  "Student Name",
  "Admission Mode",
  "Action Type",
  "Old Seat",
  "New Seat",
  "Old Seat Status",
  "New Seat Status",
  "Changed By",
  "Occurred At",
  "Note",
  "Revision"
];
const LIBRARY_DASHBOARD_HEADERS = [
  "Metric",
  "Count",
  "Updated At",
  "Revision"
];
const LIBRARY_LOG_HEADERS = [
  "Timestamp",
  "Action",
  "Status",
  "Message",
  "Previous Revision",
  "Next Revision",
  "Record Count",
  "Checksum"
];
const LIBRARY_ADMIN_SETTINGS_HEADERS = [
  "Key",
  "Value",
  "Updated At"
];
const LIBRARY_ADMIN_PASSWORD_KEY = "admin_panel_password";

function doGet(e) {
  try {
    var request = parseRequest_(e);
    requireApiKeyIfConfigured_(request);

    var action = normalizeAction_(request.action);
    if (action === "health") {
      return jsonOutput_(buildHealthResponse_());
    }
    if (action === "rebuild_students_sheet") {
      return jsonOutput_(handleRebuildStudentsSheet_());
    }
    if (action === "sync_dashboard") {
      return jsonOutput_(handleSyncDashboardRequest_());
    }
    if (action === "seat_history") {
      return jsonOutput_(handleSeatHistoryRequest_(request));
    }

    return jsonOutput_(handleStateFetch_());
  } catch (error) {
    return jsonOutput_(buildErrorResponse_(error, LIBRARY_SYNC_STATUS_ERROR));
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  var request = null;
  var action = "";

  try {
    request = parseRequest_(e);
    action = normalizeAction_(request.action);
    if (isApiKeyRequiredForAction_(action)) {
      requireApiKeyIfConfigured_(request);
    }

    if (isStateFetchAction_(action)) {
      return jsonOutput_(handleStateFetch_());
    }
    if (action === "verify_admin_password") {
      return jsonOutput_(handleVerifyAdminPasswordRequest_(request));
    }

    hasLock = lock.tryLock(LIBRARY_WEBAPP_CONFIG.LOCK_TIMEOUT_MS);
    if (!hasLock) {
      throw createAppError_(
        LIBRARY_SYNC_STATUS_BUSY,
        "Server busy hai. Dusra sync chal raha hai, thodi der baad retry kijiye."
      );
    }

    if (isImageUploadAction_(action)) {
      return jsonOutput_(handleImageUploadRequest_(request));
    }
    if (action === "reset_admin_password") {
      return jsonOutput_(handleResetAdminPasswordRequest_(request));
    }
    if (action === "sync_all") {
      return jsonOutput_(handleFullSyncRequest_(request));
    }
    if (action === "sync_delta") {
      return jsonOutput_(handleDeltaSyncRequest_(request));
    }
    if (action === "rebuild_students_sheet") {
      return jsonOutput_(handleRebuildStudentsSheet_());
    }
    if (action === "sync_dashboard") {
      return jsonOutput_(handleSyncDashboardRequest_());
    }
    if (action === "assign_seat_manual") {
      return jsonOutput_(handleManualSeatAssignRequest_(request));
    }
    if (action === "assign_seat_random") {
      return jsonOutput_(handleRandomSeatAssignRequest_(request));
    }
    if (action === "remove_seat") {
      return jsonOutput_(handleRemoveSeatRequest_(request));
    }
    if (action === "seat_history") {
      return jsonOutput_(handleSeatHistoryRequest_(request));
    }
    if (isRemoveStudentAction_(action)) {
      return jsonOutput_(handleRemoveStudentRequest_(request));
    }
    if (isCleanAllDataAction_(action)) {
      return jsonOutput_(handleCleanAllDataRequest_(request));
    }

    throw createAppError_("UNKNOWN_ACTION", "Unsupported action: " + (action || "(empty)"));
  } catch (error) {
    return jsonOutput_(buildErrorResponse_(error, LIBRARY_SYNC_STATUS_ERROR));
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

function handleStateFetch_() {
  var state = getCanonicalState_();
  return buildStateResponse_(state, {
    message: "Library state fetched."
  });
}

function handleFullSyncRequest_(request) {
  var currentState = getCanonicalState_();
  validateBaseRevision_(request, currentState);

  var incomingStudents = extractStudentList_(request);
  var normalizedStudents = finalizeStudentDataset_(incomingStudents);
  var committedState = commitState_(normalizedStudents, {
    action: "sync_all",
    previousRevision: currentState.revision,
    message: normalizedStudents.length + " students synced."
  });

  return buildStateResponse_(committedState, {
    message: normalizedStudents.length + " students synced."
  });
}

function handleDeltaSyncRequest_(request) {
  var currentState = getCanonicalState_();
  var deltaStudents = extractStudentList_(request);
  if (!deltaStudents.length) {
    return buildStateResponse_(currentState, {
      message: "Delta empty. No changes applied."
    });
  }

  var baseRevision = trimText_(request.baseRevision);
  var staleBaseRevision = Boolean(
    baseRevision &&
    trimText_(currentState.revision) &&
    baseRevision !== trimText_(currentState.revision)
  );
  var mergedStudents = mergeStudentCollections_(currentState.students, deltaStudents);
  var committedState = commitState_(mergedStudents, {
    action: "sync_delta",
    previousRevision: currentState.revision,
    message: staleBaseRevision
      ? deltaStudents.length + " delta records latest cloud state ke saath merge karke apply hue."
      : deltaStudents.length + " delta records applied."
  });

  return buildStateResponse_(committedState, {
    message: staleBaseRevision
      ? deltaStudents.length + " delta records latest cloud state ke saath merge karke apply hue."
      : deltaStudents.length + " delta records applied."
  });
}

function handleRebuildStudentsSheet_() {
  var state = getCanonicalState_();
  var spreadsheet = getLibrarySpreadsheet_();
  var studentRecordCount = getStudentRecordsOnly_(state.students).length;
  syncStudentsSheet_(spreadsheet, state);
  appendLog_(spreadsheet, {
    action: "rebuild_students_sheet",
    status: LIBRARY_SYNC_STATUS_OK,
    message: "Readable student sheets rebuilt.",
    previousRevision: state.revision,
    nextRevision: state.revision,
    recordCount: studentRecordCount,
    checksum: state.checksum
  });
  return buildStateResponse_(state, {
    message: "Readable student sheets rebuilt."
  });
}

function handleSyncDashboardRequest_() {
  syncDashboard();
  var state = getCanonicalState_();
  return buildStateResponse_(state, {
    message: "Dashboard sync complete."
  });
}

function handleSeatHistoryRequest_(request) {
  var currentState = getCanonicalState_();
  var student = getStudentRecordOrThrow_(currentState.students, extractStudentIdentifier_(request));
  var response = buildStateResponse_(currentState, {
    message: "Seat history fetched."
  });
  response.history = normalizeSeatHistory_(student.seatHistory);
  response.studentId = trimText_(student.id);
  return response;
}

function handleManualSeatAssignRequest_(request) {
  return handleSeatMutationRequest_(request, "manual_now");
}

function handleRandomSeatAssignRequest_(request) {
  return handleSeatMutationRequest_(request, "random_now");
}

function handleRemoveSeatRequest_(request) {
  return handleSeatMutationRequest_(request, "assign_later");
}

function handleSeatMutationRequest_(request, seatAction) {
  var currentState = getCanonicalState_();
  var result = applySeatMutationToState_(currentState, extractStudentIdentifier_(request), seatAction, request);
  return buildStateResponse_(result.state, {
    message: trimText_(result.message) || "Seat updated."
  });
}

function handleRemoveStudentRequest_(request) {
  var studentId = extractStudentIdentifier_(request);
  if (!studentId) {
    throw createAppError_("STUDENT_ID_REQUIRED", "Student id required hai.");
  }

  return removeStudentById(studentId);
}

function handleCleanAllDataRequest_() {
  return cleanAllData();
}

function handleImageUploadRequest_(request) {
  var spreadsheet = getLibrarySpreadsheet_();
  var images = extractRequestedImages_(request);
  if (!images.length) {
    throw createAppError_("BAD_IMAGES", "Upload ke liye images missing hain.");
  }

  var destinationFolder = resolveImageDestinationFolder_(request);
  var createStudentFolders = toBoolean_(request.createStudentFolders, true);
  var uploaded = [];

  for (var index = 0; index < images.length; index++) {
    uploaded.push(saveStudentImageFile_(destinationFolder, images[index], createStudentFolders));
  }

  appendLog_(spreadsheet, {
    action: normalizeAction_(request.action) || "upload_student_images",
    status: LIBRARY_SYNC_STATUS_OK,
    message: uploaded.length + " image files uploaded.",
    previousRevision: "",
    nextRevision: "",
    recordCount: uploaded.length,
    checksum: ""
  });

  return {
    ok: true,
    status: LIBRARY_SYNC_STATUS_OK,
    message: uploaded.length + " image files Drive me save ho gayi.",
    folderId: destinationFolder.getId(),
    folderName: destinationFolder.getName(),
    uploaded: uploaded
  };
}

function handleVerifyAdminPasswordRequest_(request) {
  var providedPassword = trimText_(request && (
    request.password ||
    request.adminPassword ||
    request.code
  ));

  if (!providedPassword) {
    throw createAppError_("ADMIN_PASSWORD_REQUIRED", "Admin password required hai.");
  }

  if (providedPassword !== getAdminPanelPassword_()) {
    throw createAppError_("ADMIN_ACCESS_DENIED", "Admin password galat hai.");
  }

  return buildAdminActionResponse_("Admin password verified.");
}

function handleResetAdminPasswordRequest_(request) {
  var masterKey = trimText_(request && request.masterKey);
  var providedApiKey = trimText_(request && (request.apiKey || request.apikey || request.key));
  var configuredApiKey = trimText_(LIBRARY_WEBAPP_CONFIG.API_KEY);
  var resetAllowedByApiKey = Boolean(configuredApiKey && providedApiKey === configuredApiKey);
  var newPassword = trimText_(request && (
    request.newPassword ||
    request.password ||
    request.adminPassword
  ));

  if (!resetAllowedByApiKey && masterKey !== trimText_(LIBRARY_WEBAPP_CONFIG.MASTER_ADMIN_RESET_KEY)) {
    throw createAppError_("ADMIN_RESET_UNAUTHORIZED", "Valid API key ya master key required hai.");
  }
  if (newPassword.length < 4) {
    throw createAppError_("ADMIN_PASSWORD_TOO_SHORT", "Naya admin password kam se kam 4 characters ka rakhiye.");
  }

  setAdminSettingValue_(getLibrarySpreadsheet_(), LIBRARY_ADMIN_PASSWORD_KEY, newPassword);
  return buildAdminActionResponse_("Admin password Google Sheet me save ho gaya.");
}

function buildAdminActionResponse_(message) {
  return {
    ok: true,
    status: LIBRARY_SYNC_STATUS_OK,
    message: trimText_(message),
    revision: "",
    updatedAt: Date.now(),
    students: [],
    recordCount: 0
  };
}

function removeStudentById(studentId) {
  var targetId = trimText_(studentId);
  var currentState = getCanonicalState_();
  var normalizedStudents = finalizeStudentDataset_(currentState.students);
  var nextStudents = normalizedStudents.filter(function(student) {
    var safeStudent = normalizeStudentRecord_(student);
    return trimText_(safeStudent.id) !== targetId &&
      normalizeReadableStudentCode_(safeStudent.manualSerialNo) !== normalizeReadableStudentCode_(targetId);
  });

  if (nextStudents.length === normalizedStudents.length) {
    throw createAppError_("STUDENT_NOT_FOUND", "Student record nahi mila.");
  }

  var committedState = commitState_(nextStudents, {
    action: "remove_student",
    previousRevision: currentState.revision,
    message: "Student permanently removed."
  });

  return buildStateResponse_(committedState, {
    message: "Student permanently removed."
  });
}

function cleanAllData() {
  var currentState = getCanonicalState_();
  if (!currentState.students.length) {
    syncDashboard();
    return buildStateResponse_(currentState, {
      message: "All data already clean hai."
    });
  }

  var committedState = commitState_([], {
    action: "clean_all_data",
    previousRevision: currentState.revision,
    message: "All student data cleaned."
  });

  return buildStateResponse_(committedState, {
    message: "All student data cleaned."
  });
}

function syncDashboard() {
  var spreadsheet = getLibrarySpreadsheet_();
  var state = getCanonicalState_();
  var studentRecordCount = getStudentRecordsOnly_(state.students).length;
  syncStudentsSheet_(spreadsheet, state);
  appendLog_(spreadsheet, {
    action: "sync_dashboard",
    status: LIBRARY_SYNC_STATUS_OK,
    message: "Dashboard sync complete.",
    previousRevision: state.revision,
    nextRevision: state.revision,
    recordCount: studentRecordCount,
    checksum: state.checksum
  });
  return state;
}

function validateBaseRevision_(request, currentState) {
  var baseRevision = trimText_(request.baseRevision);
  var currentRevision = trimText_(currentState.revision);

  if (!baseRevision || !currentRevision) {
    return;
  }

  if (baseRevision !== currentRevision) {
    var conflictError = createAppError_(
      LIBRARY_SYNC_STATUS_CONFLICT,
      "Cloud data kisi aur device se change ho gayi."
    );
    conflictError.cloudState = currentState;
    throw conflictError;
  }
}

function commitState_(nextStudents, context) {
  var spreadsheet = getLibrarySpreadsheet_();
  var currentState = getCanonicalState_();
  var sanitizedStudents = finalizeStudentDataset_(nextStudents);
  var studentRecordCount = getStudentRecordsOnly_(sanitizedStudents).length;
  var nextSlot = currentState.activeSlot === "A" ? "B" : "A";
  var nextState = {
    activeSlot: nextSlot,
    revision: createRevision_(),
    updatedAt: Date.now(),
    checksum: "",
    students: sanitizedStudents
  };
  nextState.checksum = computeStateChecksum_(nextState.students);

  writeSnapshotSlot_(spreadsheet, nextSlot, nextState);
  SpreadsheetApp.flush();
  verifySnapshotSlot_(spreadsheet, nextSlot, nextState.checksum);

  writeControlRecord_(spreadsheet, {
    activeSlot: nextSlot,
    revision: nextState.revision,
    updatedAt: nextState.updatedAt,
    recordCount: studentRecordCount,
    checksum: nextState.checksum
  });
  SpreadsheetApp.flush();

  var syncWarning = "";
  try {
    syncStudentsSheet_(spreadsheet, nextState);
  } catch (error) {
    syncWarning = trimText_(error && error.message);
  }

  var seatHistoryWarning = "";
  try {
    appendSeatHistoryDiff_(spreadsheet, currentState.students, sanitizedStudents, nextState.revision);
  } catch (error) {
    seatHistoryWarning = trimText_(error && error.message);
  }

  appendLog_(spreadsheet, {
    action: trimText_(context && context.action) || "sync",
    status: LIBRARY_SYNC_STATUS_OK,
    message: syncWarning || seatHistoryWarning
      ? "State committed. " + [
          syncWarning ? "Students sheet warning: " + syncWarning : "",
          seatHistoryWarning ? "Seat history warning: " + seatHistoryWarning : ""
        ].filter(Boolean).join(" ")
      : trimText_(context && context.message) || "State committed.",
    previousRevision: trimText_(context && context.previousRevision) || trimText_(currentState.revision),
    nextRevision: nextState.revision,
    recordCount: studentRecordCount,
    checksum: nextState.checksum
  });

  return {
    activeSlot: nextSlot,
    revision: nextState.revision,
    updatedAt: nextState.updatedAt,
    checksum: nextState.checksum,
    students: sanitizedStudents,
    syncWarning: [syncWarning, seatHistoryWarning].filter(Boolean).join(" ").trim()
  };
}

function getCanonicalState_() {
  var spreadsheet = getLibrarySpreadsheet_();
  var control = readControlRecord_(spreadsheet);
  var orderedSlots = [control.activeSlot, getAlternateSlot_(control.activeSlot)];

  for (var index = 0; index < orderedSlots.length; index++) {
    var slot = orderedSlots[index];
    var snapshot = loadSnapshotSlot_(spreadsheet, slot);
    if (snapshot && snapshot.valid) {
      var snapshotStudents = finalizeStudentDataset_(snapshot.students);
      return {
        activeSlot: slot,
        revision: trimText_(snapshot.revision),
        updatedAt: toNumber_(snapshot.updatedAt, 0),
        checksum: trimText_(snapshot.checksum) || computeStateChecksum_(snapshotStudents),
        students: snapshotStudents
      };
    }
  }

  var bootstrapStudents = finalizeStudentDataset_(readStudentsSheetRecords_(spreadsheet));
  var bootstrapUpdatedAt = bootstrapStudents.reduce(function(maxValue, student) {
    return Math.max(maxValue, toNumber_(student && student.updatedAt, 0));
  }, 0);

  return {
    activeSlot: trimText_(control.activeSlot) || "A",
    revision: "",
    updatedAt: bootstrapUpdatedAt,
    checksum: bootstrapStudents.length ? computeStateChecksum_(bootstrapStudents) : "",
    students: bootstrapStudents
  };
}

function readControlRecord_(spreadsheet) {
  var sheet = ensureControlSheet_(spreadsheet);
  var values = sheet.getRange(2, 1, 1, LIBRARY_CONTROL_HEADERS.length).getValues()[0];
  var activeSlot = trimText_(values[0]) || "A";
  if (LIBRARY_WEBAPP_CONFIG.SNAPSHOT_SLOTS.indexOf(activeSlot) === -1) {
    activeSlot = "A";
  }

  return {
    activeSlot: activeSlot,
    revision: trimText_(values[1]),
    updatedAt: toNumber_(values[2], 0),
    recordCount: toNumber_(values[3], 0),
    checksum: trimText_(values[4]),
    committedAt: trimText_(values[5])
  };
}

function writeControlRecord_(spreadsheet, record) {
  var sheet = ensureControlSheet_(spreadsheet);
  writeSheetRows_(sheet, 2, 1, [[
    trimText_(record.activeSlot) || "A",
    trimText_(record.revision),
    toNumber_(record.updatedAt, 0),
    toNumber_(record.recordCount, 0),
    trimText_(record.checksum),
    formatTimestampForSheet_(new Date())
  ]], LIBRARY_CONTROL_HEADERS.length);
}

function loadSnapshotSlot_(spreadsheet, slot) {
  var sheet = ensureSnapshotSheet_(spreadsheet, slot);
  var meta = sheet.getRange(2, 1, 1, LIBRARY_SNAPSHOT_META_HEADERS.length).getValues()[0];
  var chunkRowCount = Math.max(0, sheet.getLastRow() - 4);
  var joinedJson = "";

  if (chunkRowCount > 0) {
    var chunkValues = sheet.getRange(5, 2, chunkRowCount, 1).getValues();
    for (var index = 0; index < chunkValues.length; index++) {
      joinedJson += String(chunkValues[index][0] || "");
    }
  }

  if (!trimText_(joinedJson)) {
    return {
      valid: false,
      slot: slot,
      revision: trimText_(meta[1]),
      updatedAt: toNumber_(meta[2], 0),
      checksum: trimText_(meta[4]),
      students: []
    };
  }

  var payload = parseJsonSafely_(joinedJson);
  if (!Array.isArray(payload)) {
    return {
      valid: false,
      slot: slot,
      revision: trimText_(meta[1]),
      updatedAt: toNumber_(meta[2], 0),
      checksum: trimText_(meta[4]),
      students: []
    };
  }

  var checksum = computeDigestHex_(joinedJson);
  var expectedChecksum = trimText_(meta[4]);
  return {
    valid: !expectedChecksum || checksum === expectedChecksum,
    slot: slot,
    revision: trimText_(meta[1]),
    updatedAt: toNumber_(meta[2], 0),
    checksum: expectedChecksum || checksum,
    students: payload
  };
}

function writeSnapshotSlot_(spreadsheet, slot, state) {
  var sheet = ensureSnapshotSheet_(spreadsheet, slot);
  var safeStudents = finalizeStudentDataset_(state.students);
  var json = JSON.stringify(safeStudents);
  var checksum = computeDigestHex_(json);
  var chunks = splitIntoChunks_(json, LIBRARY_WEBAPP_CONFIG.SNAPSHOT_CHUNK_SIZE);
  var rows = [];

  rows.push(LIBRARY_SNAPSHOT_META_HEADERS);
  rows.push([
    slot,
    trimText_(state.revision),
    toNumber_(state.updatedAt, 0),
    getStudentRecordsOnly_(safeStudents).length,
    checksum,
    formatTimestampForSheet_(new Date())
  ]);
  rows.push(["", "", "", "", "", ""]);
  rows.push(["chunk_index", "json_chunk", "", "", "", ""]);

  for (var index = 0; index < chunks.length; index++) {
    rows.push([index + 1, chunks[index], "", "", "", ""]);
  }

  sheet.clearContents();
  writeSheetRows_(sheet, 1, 1, rows, LIBRARY_SNAPSHOT_META_HEADERS.length);
  sheet.setFrozenRows(4);
  hideSheetSafely_(spreadsheet, sheet);
}

function verifySnapshotSlot_(spreadsheet, slot, expectedChecksum) {
  var snapshot = loadSnapshotSlot_(spreadsheet, slot);
  if (!snapshot || !snapshot.valid) {
    throw createAppError_("SNAPSHOT_VERIFY_FAILED", "Snapshot verify failed for slot " + slot + ".");
  }
  if (trimText_(expectedChecksum) && trimText_(snapshot.checksum) !== trimText_(expectedChecksum)) {
    throw createAppError_("SNAPSHOT_VERIFY_FAILED", "Snapshot checksum mismatch for slot " + slot + ".");
  }
}

function normalizeLibraryStatus_(value, deletedAt, selectedAt) {
  if (toNumber_(deletedAt, 0) > 0) {
    return "left";
  }

  var normalized = trimText_(value).toLowerCase();
  if (normalized === "selected" || toNumber_(selectedAt, 0) > 0) {
    return "selected";
  }
  if (normalized === "left" || normalized === "inactive" || normalized === "deleted") {
    return "left";
  }
  return "active";
}

function getStudentLibraryStatus_(student) {
  if (isUiContentRecord_(student)) {
    return "system";
  }
  var safeStudent = normalizeStudentRecord_(student);
  return normalizeLibraryStatus_(safeStudent.libraryStatus, safeStudent.deletedAt, safeStudent.selectedAt);
}

function isStudentActive_(student) {
  return getStudentLibraryStatus_(student) === "active";
}

function isUiContentRecord_(record) {
  var safeRecord = record && typeof record === "object" ? record : {};
  var recordType = trimText_(safeRecord.systemRecordType || safeRecord.recordType || safeRecord.type).toLowerCase();
  var recordId = trimText_(safeRecord.id);
  return recordType === LIBRARY_UI_CONTENT_RECORD_TYPE || recordId === LIBRARY_UI_CONTENT_RECORD_ID;
}

function getUiContentRecordUpdatedAt_(record) {
  var safeRecord = record && typeof record === "object" ? record : {};
  return Math.max(
    toNumber_(safeRecord.uiContentUpdatedAt, 0),
    toNumber_(safeRecord.topbarImageUpdatedAt, 0),
    toNumber_(safeRecord.socialLinksUpdatedAt, 0),
    toNumber_(safeRecord.updatedAt, 0)
  );
}

function normalizeUiContentRecord_(record) {
  var base = record && typeof record === "object" ? record : {};
  var updatedAt = getUiContentRecordUpdatedAt_(base);
  var topbarImageUrl = trimText_(base.topbarImageUrl || base.topbarCenterImageUrl || base.devotionalImageUrl);
  var youtubeUrl = trimText_(base.youtubeUrl || base.youtube || (base.socialLinks && base.socialLinks.youtube));
  var instagramUrl = trimText_(base.instagramUrl || base.instagram || (base.socialLinks && base.socialLinks.instagram));
  var facebookUrl = trimText_(base.facebookUrl || base.facebook || (base.socialLinks && base.socialLinks.facebook));

  return {
    id: LIBRARY_UI_CONTENT_RECORD_ID,
    systemRecordType: LIBRARY_UI_CONTENT_RECORD_TYPE,
    recordType: LIBRARY_UI_CONTENT_RECORD_TYPE,
    type: LIBRARY_UI_CONTENT_RECORD_TYPE,
    name: trimText_(base.name) || "__Attendance UI Content__",
    topbarImageUrl: topbarImageUrl,
    topbarImageUpdatedAt: toNumber_(base.topbarImageUpdatedAt, 0) || updatedAt,
    socialLinksUpdatedAt: toNumber_(base.socialLinksUpdatedAt, 0) || updatedAt,
    uiContentUpdatedAt: updatedAt,
    updatedAt: updatedAt,
    socialLinks: {
      youtube: youtubeUrl,
      instagram: instagramUrl,
      facebook: facebookUrl
    },
    youtubeUrl: youtubeUrl,
    instagramUrl: instagramUrl,
    facebookUrl: facebookUrl,
    hidden: true,
    libraryStatus: "system",
    selectedAt: 0,
    deletedAt: 0,
    manualSerialNo: "",
    seat: "",
    slot: "",
    mobile: "",
    parentMobile: "",
    parentName: "",
    status: "",
    attendance: "",
    photo: "",
    goal: ""
  };
}

function mergeUiContentRecords_(left, right) {
  var current = normalizeUiContentRecord_(left);
  var incoming = normalizeUiContentRecord_(right);
  var useIncoming = getUiContentRecordUpdatedAt_(incoming) >= getUiContentRecordUpdatedAt_(current);
  var newer = useIncoming ? incoming : current;
  var older = useIncoming ? current : incoming;
  var nextUpdatedAt = Math.max(getUiContentRecordUpdatedAt_(current), getUiContentRecordUpdatedAt_(incoming));

  return normalizeUiContentRecord_(objectAssign_({}, older, newer, {
    id: LIBRARY_UI_CONTENT_RECORD_ID,
    systemRecordType: LIBRARY_UI_CONTENT_RECORD_TYPE,
    recordType: LIBRARY_UI_CONTENT_RECORD_TYPE,
    type: LIBRARY_UI_CONTENT_RECORD_TYPE,
    name: trimText_(newer.name) || trimText_(older.name) || "__Attendance UI Content__",
    topbarImageUrl: trimText_(newer.topbarImageUrl),
    topbarImageUpdatedAt: toNumber_(newer.topbarImageUpdatedAt, 0) || nextUpdatedAt,
    socialLinksUpdatedAt: toNumber_(newer.socialLinksUpdatedAt, 0) || nextUpdatedAt,
    uiContentUpdatedAt: nextUpdatedAt,
    updatedAt: nextUpdatedAt,
    socialLinks: {
      youtube: trimText_(newer.youtubeUrl),
      instagram: trimText_(newer.instagramUrl),
      facebook: trimText_(newer.facebookUrl)
    },
    youtubeUrl: trimText_(newer.youtubeUrl),
    instagramUrl: trimText_(newer.instagramUrl),
    facebookUrl: trimText_(newer.facebookUrl),
    hidden: true,
    libraryStatus: "system",
    selectedAt: 0,
    deletedAt: 0,
    manualSerialNo: "",
    seat: "",
    slot: "",
    mobile: "",
    parentMobile: "",
    parentName: "",
    status: "",
    attendance: "",
    photo: "",
    goal: ""
  }));
}

function getStudentRecordsOnly_(list) {
  return finalizeStudentDataset_(list || []).filter(function(record) {
    return !isUiContentRecord_(record);
  });
}

function buildStudentsSheetIdentity_(student) {
  if (isUiContentRecord_(student)) {
    return LIBRARY_UI_CONTENT_RECORD_ID;
  }
  var safeStudent = normalizeStudentRecord_(student);
  var manualCode = normalizeReadableStudentCode_(safeStudent.manualSerialNo);
  var seatValue = trimText_(safeStudent.seat) === "" ? "" : String(toNumber_(safeStudent.seat, ""));

  return manualCode ||
    trimText_(safeStudent.id) ||
    [
      trimText_(safeStudent.name).toLowerCase(),
      normalizePhone_(safeStudent.mobile),
      seatValue,
      trimText_(safeStudent.slot).toLowerCase()
    ].join("|");
}

function parseStudentsSheetRow_(row, lifecycleStatus) {
  var values = Array.isArray(row) ? row : [];
  var rowKey = trimText_(values[0]);
  var manualCode = normalizeReadableStudentCode_(values[19] || rowKey);
  var parsedHistory = parseJsonSafely_(values[25]);
  var parsedSeatHistory = parseJsonSafely_(values[35]);
  var stableUpdatedAt = toNumber_(values[24], 0) || Date.parse(trimText_(values[9]) || trimText_(values[10]) || "") || 1;
  var normalizedLifecycleStatus = trimText_(typeof lifecycleStatus === "string" ? lifecycleStatus : "active").toLowerCase();
  var resolvedDeletedAt = normalizedLifecycleStatus === "left"
    ? (toNumber_(values[23], 0) || stableUpdatedAt)
    : 0;
  var resolvedSelectedAt = normalizedLifecycleStatus === "selected"
    ? stableUpdatedAt
    : 0;

  return normalizeStudentRecord_({
    id: rowKey && rowKey.indexOf("srv_") === 0 ? rowKey : "",
    manualSerialNo: manualCode || rowKey,
    name: trimText_(values[1]),
    parentName: trimText_(values[2]),
    seat: trimText_(values[3]) === "" ? "" : toNumber_(values[3], ""),
    slot: trimText_(values[4]),
    timeStart: trimText_(values[5]),
    timeEnd: trimText_(values[6]),
    fee: toNumber_(values[7], 0),
    feePlan: trimText_(values[8]),
    admission: trimText_(values[9]),
    feedate: trimText_(values[10]),
    status: trimText_(values[11]),
    attendance: trimText_(values[12]),
    mobile: trimText_(values[13]),
    parentMobile: trimText_(values[14]),
    addressType: trimText_(values[15]),
    localAddress: trimText_(values[16]),
    permanentAddress: trimText_(values[17]),
    studentAadharNo: trimText_(values[18]),
    lockerNo: trimText_(values[20]),
    goal: trimText_(values[21]),
    photo: trimText_(values[22]),
    updatedAt: stableUpdatedAt,
    paidHistory: Array.isArray(parsedHistory) ? parsedHistory : [],
    attendanceSource: trimText_(values[26]),
    lastAttendanceDate: trimText_(values[27]),
    lastAttendanceTime: trimText_(values[28]),
    lastPaymentEntryDate: trimText_(values[29]),
    lastPaymentEntryAmount: toNumber_(values[30], 0),
    admissionMode: trimText_(values[31]),
    seatStatus: trimText_(values[32]),
    seatAssignedAt: trimText_(values[33]),
    seatAssignedBy: trimText_(values[34]),
    seatHistory: Array.isArray(parsedSeatHistory) ? parsedSeatHistory : [],
    libraryStatus: normalizedLifecycleStatus === "left"
      ? "left"
      : normalizedLifecycleStatus === "selected"
        ? "selected"
        : "active",
    selectedAt: resolvedSelectedAt,
    deletedAt: resolvedDeletedAt
  });
}

function readLifecycleSheetRecords_(sheet, lifecycleStatus) {
  if (!sheet) {
    return [];
  }

  ensureSheetGridSize_(sheet, Math.max(1, sheet.getMaxRows()), LIBRARY_STUDENT_HEADERS.length);

  var dataRowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!dataRowCount) {
    return [];
  }

  return sheet.getRange(2, 1, dataRowCount, LIBRARY_STUDENT_HEADERS.length).getValues()
    .filter(function(row) {
      return row.some(function(cell) {
        return trimText_(cell) !== "";
      });
    })
    .map(function(row) {
      return parseStudentsSheetRow_(row, lifecycleStatus);
    });
}

function readStudentsSheetRecords_(spreadsheet) {
  var combined = []
    .concat(readLifecycleSheetRecords_(getSheetIfExists_(spreadsheet, LIBRARY_WEBAPP_CONFIG.ACTIVE_STUDENTS_SHEET_NAME), "active"))
    .concat(readLifecycleSheetRecords_(getSheetIfExists_(spreadsheet, LIBRARY_WEBAPP_CONFIG.SELECTED_STUDENTS_SHEET_NAME), "selected"))
    .concat(readLifecycleSheetRecords_(getSheetIfExists_(spreadsheet, LIBRARY_WEBAPP_CONFIG.LEFT_STUDENTS_SHEET_NAME), "left"));

  if (combined.length) {
    return finalizeStudentDataset_(combined);
  }

  return readLifecycleSheetRecords_(getSheetIfExists_(spreadsheet, LIBRARY_WEBAPP_CONFIG.STUDENTS_SHEET_NAME), "active");
}

function reconcileStateWithStudentsSheet_(spreadsheet, state) {
  var safeState = state && typeof state === "object" ? state : {};
  var stateStudents = finalizeStudentDataset_(safeState.students);
  var sheetStudents = readStudentsSheetRecords_(spreadsheet);
  var sheetMap = {};
  var usedKeys = {};
  var changed = false;

  sheetStudents.forEach(function(student) {
    var key = buildStudentsSheetIdentity_(student);
    if (key && !sheetMap[key]) {
      sheetMap[key] = student;
    }
  });

  var reconciledStudents = stateStudents.map(function(student) {
    var normalized = normalizeStudentRecord_(student);
    var key = buildStudentsSheetIdentity_(normalized);
    var matchingSheetStudent = key ? sheetMap[key] : null;

    if (matchingSheetStudent) {
      usedKeys[key] = true;
      var normalizedUpdatedAt = toNumber_(normalized.updatedAt, 0);
      var sheetUpdatedAt = toNumber_(matchingSheetStudent.updatedAt, 0);

      // Snapshot lifecycle changes (left/selected/rejoin) ko stale readable sheet row se overwrite mat karo.
      if (!isStudentActive_(normalized) && normalizedUpdatedAt >= sheetUpdatedAt) {
        return normalized;
      }

      if (!isStudentActive_(normalized)) {
        changed = true;
      }
      return normalizeStudentRecord_(objectAssign_({}, mergeStudentRecords_(normalized, objectAssign_({}, matchingSheetStudent, {
        id: trimText_(normalized.id) || trimText_(matchingSheetStudent.id),
        manualSerialNo: trimText_(normalized.manualSerialNo) || trimText_(matchingSheetStudent.manualSerialNo),
        libraryStatus: "active",
        selectedAt: 0,
        deletedAt: 0,
        updatedAt: Math.max(toNumber_(normalized.updatedAt, 0), toNumber_(matchingSheetStudent.updatedAt, 0))
      })), {
        libraryStatus: "active",
        selectedAt: 0,
        deletedAt: 0
      }));
    }

    if (isStudentActive_(normalized)) {
      changed = true;
      return normalizeStudentRecord_(objectAssign_({}, normalized, {
        libraryStatus: "left",
        selectedAt: 0,
        deletedAt: toNumber_(normalized.deletedAt, 0) || Date.now(),
        updatedAt: Math.max(toNumber_(normalized.updatedAt, 0), Date.now())
      }));
    }

    return normalized;
  });

  sheetStudents.forEach(function(student) {
    var key = buildStudentsSheetIdentity_(student);
    if (!key || usedKeys[key]) {
      return;
    }

    changed = true;
    reconciledStudents.push(normalizeStudentRecord_(objectAssign_({}, student, {
      libraryStatus: "active",
      selectedAt: 0,
      deletedAt: 0
    })));
  });

  var finalStudents = finalizeStudentDataset_(reconciledStudents);
  var nextChecksum = computeStateChecksum_(finalStudents);
  changed = changed || trimText_(safeState.checksum) !== trimText_(nextChecksum);
  return {
    activeSlot: trimText_(safeState.activeSlot) || "A",
    revision: trimText_(safeState.revision),
    updatedAt: changed ? Math.max(toNumber_(safeState.updatedAt, 0), Date.now()) : toNumber_(safeState.updatedAt, 0),
    checksum: nextChecksum,
    students: finalStudents
  };
}

function getActiveStudentsForSheet_(list) {
  return finalizeStudentDataset_(list || []).filter(function(student) {
    return isStudentActive_(student);
  });
}

function getSelectedStudentsForSheet_(list) {
  return finalizeStudentDataset_(list || []).filter(function(student) {
    return getStudentLibraryStatus_(student) === "selected";
  });
}

function getLeftStudentsForSheet_(list) {
  return finalizeStudentDataset_(list || []).filter(function(student) {
    return getStudentLibraryStatus_(student) === "left";
  });
}

function writeLifecycleStudentSheet_(sheet, students) {
  var safeStudents = getStudentRecordsOnly_(students || []);
  var rows = [LIBRARY_STUDENT_HEADERS];

  for (var index = 0; index < safeStudents.length; index++) {
    rows.push(buildStudentSheetRow_(safeStudents[index]));
  }

  sheet.clearContents();
  writeSheetRows_(sheet, 1, 1, rows, LIBRARY_STUDENT_HEADERS.length);
  sheet.setFrozenRows(1);
}

function buildDashboardSheetRows_(state, students) {
  var safeStudents = getStudentRecordsOnly_(students || []);
  var updatedAt = toNumber_(state && state.updatedAt, 0)
    ? formatTimestampForSheet_(new Date(toNumber_(state && state.updatedAt, 0)))
    : "";
  var revision = trimText_(state && state.revision);

  return [
    LIBRARY_DASHBOARD_HEADERS,
    ["Total Students", safeStudents.length, updatedAt, revision],
    ["Active Students", getActiveStudentsForSheet_(safeStudents).length, updatedAt, revision],
    ["Selected Students", getSelectedStudentsForSheet_(safeStudents).length, updatedAt, revision],
    ["Left Students", getLeftStudentsForSheet_(safeStudents).length, updatedAt, revision]
  ];
}

function syncDashboardSheet_(spreadsheet, state, students) {
  var sheet = ensureDashboardSheet_(spreadsheet);
  var rows = buildDashboardSheetRows_(state, students);
  sheet.clearContents();
  writeSheetRows_(sheet, 1, 1, rows, LIBRARY_DASHBOARD_HEADERS.length);
  sheet.setFrozenRows(1);
}

function syncLegacyStudentsSheet_(spreadsheet, activeStudents) {
  var legacySheet = getSheetIfExists_(spreadsheet, LIBRARY_WEBAPP_CONFIG.STUDENTS_SHEET_NAME);
  if (!legacySheet) {
    return;
  }

  writeLifecycleStudentSheet_(legacySheet, activeStudents);
  hideSheetSafely_(spreadsheet, legacySheet);
}

function syncStudentsSheet_(spreadsheet, state) {
  var safeStudents = finalizeStudentDataset_(state && state.students);
  var activeStudents = getActiveStudentsForSheet_(safeStudents);
  var selectedStudents = getSelectedStudentsForSheet_(safeStudents);
  var leftStudents = getLeftStudentsForSheet_(safeStudents);

  syncDashboardSheet_(spreadsheet, state, safeStudents);
  writeLifecycleStudentSheet_(ensureActiveStudentsSheet_(spreadsheet), activeStudents);
  writeLifecycleStudentSheet_(ensureSelectedStudentsSheet_(spreadsheet), selectedStudents);
  writeLifecycleStudentSheet_(ensureLeftStudentsSheet_(spreadsheet), leftStudents);
  syncLegacyStudentsSheet_(spreadsheet, activeStudents);
}

function buildStudentSheetRow_(student) {
  var paidHistory = Array.isArray(student.paidHistory) ? student.paidHistory : [];
  return [
    trimText_(student.manualSerialNo) || trimText_(student.id),
    trimText_(student.name),
    trimText_(student.parentName),
    toNumberOrBlank_(student.seat),
    trimText_(student.slot),
    trimText_(student.timeStart),
    trimText_(student.timeEnd),
    toNumber_(student.fee, 0),
    trimText_(student.feePlan),
    trimText_(student.admission),
    trimText_(student.feedate),
    trimText_(student.status),
    trimText_(student.attendance),
    trimText_(student.mobile),
    trimText_(student.parentMobile),
    trimText_(student.addressType),
    trimText_(student.localAddress),
    trimText_(student.permanentAddress),
    trimText_(student.studentAadharNo),
    trimText_(student.manualSerialNo),
    trimText_(student.lockerNo),
    trimText_(student.goal),
    trimText_(student.photo),
    toNumberOrBlank_(student.deletedAt),
    toNumber_(student.updatedAt, 0),
    JSON.stringify(normalizePaidHistory_(paidHistory)),
    trimText_(student.attendanceSource),
    trimText_(student.lastAttendanceDate),
    trimText_(student.lastAttendanceTime),
    trimText_(student.lastPaymentEntryDate),
    toNumber_(student.lastPaymentEntryAmount, 0),
    normalizeAdmissionMode_(student.admissionMode),
    trimText_(student.seatStatus),
    trimText_(student.seatAssignedAt),
    trimText_(student.seatAssignedBy),
    JSON.stringify(normalizeSeatHistory_(student.seatHistory))
  ];
}

function appendLog_(spreadsheet, entry) {
  var sheet = ensureLogSheet_(spreadsheet);
  sheet.appendRow([
    formatTimestampForSheet_(new Date()),
    trimText_(entry.action),
    trimText_(entry.status),
    trimText_(entry.message),
    trimText_(entry.previousRevision),
    trimText_(entry.nextRevision),
    toNumber_(entry.recordCount, 0),
    trimText_(entry.checksum)
  ]);

  var lastRow = sheet.getLastRow();
  if (lastRow > LIBRARY_WEBAPP_CONFIG.MAX_LOG_ROWS + 1) {
    sheet.deleteRows(2, lastRow - LIBRARY_WEBAPP_CONFIG.MAX_LOG_ROWS - 1);
  }
}

function buildHealthResponse_() {
  var state = getCanonicalState_();
  var studentRecords = getStudentRecordsOnly_(state.students);
  return {
    ok: true,
    status: LIBRARY_SYNC_STATUS_OK,
    message: "Library API is running.",
    revision: state.revision,
    updatedAt: state.updatedAt,
    students: state.students,
    recordCount: studentRecords.length
  };
}

function buildStateResponse_(state, options) {
  var safeStudents = finalizeStudentDataset_(state && state.students);
  var studentRecords = getStudentRecordsOnly_(safeStudents);
  var message = trimText_(options && options.message);
  var syncWarning = trimText_(state && state.syncWarning);
  return {
    ok: true,
    status: LIBRARY_SYNC_STATUS_OK,
    message: syncWarning ? (message ? message + " " + syncWarning : syncWarning) : message,
    revision: trimText_(state && state.revision),
    updatedAt: toNumber_(state && state.updatedAt, 0),
    students: safeStudents,
    recordCount: studentRecords.length
  };
}

function buildErrorResponse_(error, fallbackStatus) {
  var status = trimText_(error && error.code) || trimText_(fallbackStatus) || LIBRARY_SYNC_STATUS_ERROR;
  var cloudState = error && error.cloudState ? error.cloudState : null;

  if (status === LIBRARY_SYNC_STATUS_CONFLICT && cloudState) {
    var conflictStudents = finalizeStudentDataset_(cloudState.students);
    var conflictStudentRecords = getStudentRecordsOnly_(conflictStudents);
    return {
      ok: false,
      status: LIBRARY_SYNC_STATUS_CONFLICT,
      message: trimText_(error && error.message) || "Cloud data kisi aur device se change ho gayi.",
      revision: trimText_(cloudState.revision),
      updatedAt: toNumber_(cloudState.updatedAt, 0),
      students: conflictStudents,
      recordCount: conflictStudentRecords.length
    };
  }

  return {
    ok: false,
    status: status,
    message: trimText_(error && error.message) || "Unexpected server error.",
    revision: "",
    updatedAt: 0,
    students: [],
    recordCount: 0
  };
}

function parseRequest_(e) {
  var params = objectAssign_({}, (e && e.parameter) || {});
  var contentType = trimText_(e && e.postData && e.postData.type);
  var rawBody = trimText_(e && e.postData && e.postData.contents);
  var payload = {};

  if (rawBody) {
    if (looksLikeJson_(rawBody)) {
      payload = parseJsonSafely_(rawBody) || {};
    } else if (contentType.indexOf("application/x-www-form-urlencoded") !== -1) {
      payload = objectAssign_({}, params);
    }
  } else {
    payload = objectAssign_({}, params);
  }

  payload = objectAssign_({}, params, payload);
  payload.pathInfo = trimText_(e && e.pathInfo);
  payload.httpMethod = e && e.postData ? "POST" : "GET";

  if (typeof payload.images === "string") {
    payload.images = parseJsonSafely_(payload.images) || [];
  }
  if (typeof payload.records === "string") {
    payload.records = parseJsonSafely_(payload.records) || [];
  }
  if (typeof payload.files === "string") {
    payload.files = parseJsonSafely_(payload.files) || [];
  }
  if (typeof payload.data === "string" && looksLikeJson_(payload.data)) {
    payload.data = parseJsonSafely_(payload.data) || [];
  }

  return applyRouteParams_(payload);
}

function applyRouteParams_(payload) {
  var next = objectAssign_({}, payload || {});
  var normalizedPath = trimText_(next.pathInfo).replace(/^\/+|\/+$/g, "");
  if (!normalizedPath) {
    return next;
  }

  var parts = normalizedPath.split("/").filter(Boolean);
  if (normalizeAction_(parts[0]) !== "admissions" || parts.length < 3) {
    return next;
  }

  var studentId = decodeUriComponentSafe_(parts[1]);
  var tail = parts.slice(2).map(normalizeAction_);

  if (tail[0] === "assign-seat" && tail[1] === "manual") {
    next.action = next.action || "assign_seat_manual";
  } else if (tail[0] === "assign-seat" && tail[1] === "random") {
    next.action = next.action || "assign_seat_random";
  } else if (tail[0] === "remove-seat") {
    next.action = next.action || "remove_seat";
  } else if (tail[0] === "seat-history") {
    next.action = next.action || "seat_history";
  }

  if (studentId) {
    next.studentId = trimText_(next.studentId) || trimText_(next.id) || studentId;
  }
  return next;
}

function requireApiKeyIfConfigured_(request) {
  if (!trimText_(LIBRARY_WEBAPP_CONFIG.API_KEY)) {
    return;
  }

  var providedApiKey = trimText_(request && (request.apiKey || request.apikey || request.key));
  if (providedApiKey !== trimText_(LIBRARY_WEBAPP_CONFIG.API_KEY)) {
    throw createAppError_("UNAUTHORIZED", "Valid API key required.");
  }
}

function isApiKeyRequiredForAction_(action) {
  return normalizeAction_(action) !== "verify_admin_password";
}

function extractStudentList_(request) {
  var source = [];
  if (Array.isArray(request && request.data)) {
    source = request.data;
  } else if (Array.isArray(request && request.students)) {
    source = request.students;
  } else if (Array.isArray(request)) {
    source = request;
  }
  return finalizeStudentDataset_(source);
}

function extractRequestedImages_(request) {
  var source = [];
  if (Array.isArray(request && request.images)) {
    source = request.images;
  } else if (Array.isArray(request && request.records)) {
    source = request.records;
  } else if (Array.isArray(request && request.files)) {
    source = request.files;
  }
  return source.filter(function(item) {
    return item && typeof item === "object";
  });
}

function extractStudentIdentifier_(request) {
  return trimText_(request && (
    request.studentId ||
    request.id ||
    request.studentCode ||
    request.manualSerialNo
  ));
}

function isStateFetchAction_(action) {
  return [
    "fetch_state",
    "fetchstate",
    "get_state",
    "sync_dashboard_state"
  ].indexOf(normalizeAction_(action)) !== -1;
}

function isRemoveStudentAction_(action) {
  return [
    "remove_student",
    "removestudent",
    "remove_student_by_id",
    "removestudentbyid",
    "delete_student",
    "deletestudent"
  ].indexOf(normalizeAction_(action)) !== -1;
}

function isCleanAllDataAction_(action) {
  return [
    "clean_all_data",
    "cleanalldata",
    "clear_all_data",
    "clearalldata"
  ].indexOf(normalizeAction_(action)) !== -1;
}

function isImageUploadAction_(action) {
  return [
    "upload_student_images",
    "upload_images",
    "backup_student_images",
    "backup_images",
    "uploadstudentimages"
  ].indexOf(normalizeAction_(action)) !== -1;
}

function resolveImageDestinationFolder_(request) {
  var folderMode = trimText_(request.folderMode).toLowerCase();
  var customFolderId = trimText_(request.folderId || request.driveFolderId);
  var folderName = trimText_(request.folderName) || LIBRARY_WEBAPP_CONFIG.DEFAULT_DRIVE_FOLDER_NAME;
  var rootFolder = trimText_(LIBRARY_WEBAPP_CONFIG.DEFAULT_DRIVE_ROOT_FOLDER_ID)
    ? DriveApp.getFolderById(LIBRARY_WEBAPP_CONFIG.DEFAULT_DRIVE_ROOT_FOLDER_ID)
    : DriveApp.getRootFolder();

  if (folderMode === "custom") {
    if (!customFolderId) {
      throw createAppError_("BAD_FOLDER", "Custom folder mode me folder ID zaruri hai.");
    }
    return DriveApp.getFolderById(customFolderId);
  }

  return getOrCreateChildFolder_(rootFolder, folderName);
}

function saveStudentImageFile_(destinationFolder, image, createStudentFolders) {
  var parsedImage = parseIncomingImagePayload_(image);
  var studentId = trimText_(image && image.studentId);
  var targetFolder = createStudentFolders
    ? getOrCreateChildFolder_(destinationFolder, buildStudentFolderName_(image))
    : destinationFolder;
  var timestamp = Utilities.formatDate(new Date(), LIBRARY_WEBAPP_CONFIG.TIMEZONE, "yyyyMMdd_HHmmss");
  var fileName = buildStudentImageFileName_(image, parsedImage.extension, timestamp);
  var blob = Utilities.newBlob(parsedImage.bytes, parsedImage.mimeType, fileName);
  var file = targetFolder.createFile(blob);

  return {
    key: trimText_(image && image.key),
    studentId: studentId,
    imageType: trimText_(image && image.imageType) || "image",
    fileId: file.getId(),
    url: "https://drive.google.com/file/d/" + file.getId() + "/view",
    directUrl: "https://drive.google.com/uc?id=" + file.getId(),
    folderId: targetFolder.getId(),
    folderName: targetFolder.getName(),
    fileName: file.getName()
  };
}

function parseIncomingImagePayload_(image) {
  var dataUrl = trimText_(image && (image.dataUrl || image.data));
  var match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw createAppError_("BAD_IMAGE", "Image payload invalid hai.");
  }

  var mimeType = match[1];
  var bytes = Utilities.base64Decode(match[2]);
  var extension = mimeType.indexOf("png") !== -1 ? ".png" : ".jpg";
  return {
    mimeType: mimeType,
    bytes: bytes,
    extension: extension
  };
}

function buildStudentFolderName_(image) {
  var studentId = sanitizeDriveNamePart_(image && image.studentId || "student");
  var studentName = sanitizeDriveNamePart_(image && (image.studentName || image.name) || "");
  return studentName ? studentId + "_" + studentName : studentId;
}

function buildStudentImageFileName_(image, extension, timestamp) {
  var studentId = sanitizeDriveNamePart_(image && image.studentId || "student");
  var imageType = sanitizeDriveNamePart_(image && image.imageType || "image");
  return [studentId, imageType, timestamp].join("_") + extension;
}

function sanitizeDriveNamePart_(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_") || "item";
}

function getOrCreateChildFolder_(parentFolder, folderName) {
  var iterator = parentFolder.getFoldersByName(folderName);
  return iterator.hasNext() ? iterator.next() : parentFolder.createFolder(folderName);
}

function getLibrarySpreadsheet_() {
  if (trimText_(LIBRARY_WEBAPP_CONFIG.SPREADSHEET_ID)) {
    return SpreadsheetApp.openById(LIBRARY_WEBAPP_CONFIG.SPREADSHEET_ID);
  }

  var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSpreadsheet) {
    throw createAppError_(
      "SPREADSHEET_NOT_FOUND",
      "Spreadsheet ID set kijiye ya script ko Google Sheet se bind kijiye."
    );
  }

  return activeSpreadsheet;
}

function ensureControlSheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.CONTROL_SHEET_NAME);
  ensureSheetGridSize_(sheet, 2, LIBRARY_CONTROL_HEADERS.length);
  if (sheet.getLastRow() === 0) {
    writeSheetRows_(sheet, 1, 1, [
      LIBRARY_CONTROL_HEADERS,
      ["A", "", 0, 0, "", ""]
    ], LIBRARY_CONTROL_HEADERS.length);
    sheet.setFrozenRows(1);
  }
  hideSheetSafely_(spreadsheet, sheet);
  return sheet;
}

function ensureSnapshotSheet_(spreadsheet, slot) {
  var sheet = getOrCreateSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.SNAPSHOT_SHEET_PREFIX + slot);
  ensureSheetGridSize_(sheet, 4, LIBRARY_SNAPSHOT_META_HEADERS.length);
  if (sheet.getLastRow() === 0) {
    writeSheetRows_(sheet, 1, 1, [
      LIBRARY_SNAPSHOT_META_HEADERS,
      [slot, "", 0, 0, "", ""],
      ["", "", "", "", "", ""],
      ["chunk_index", "json_chunk", "", "", "", ""]
    ], LIBRARY_SNAPSHOT_META_HEADERS.length);
    sheet.setFrozenRows(4);
  }
  hideSheetSafely_(spreadsheet, sheet);
  return sheet;
}

function ensureStudentsSheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.STUDENTS_SHEET_NAME);
  ensureSheetGridSize_(sheet, 1, LIBRARY_STUDENT_HEADERS.length);
  if (sheet.getLastRow() === 0) {
    writeSheetRows_(sheet, 1, 1, [LIBRARY_STUDENT_HEADERS], LIBRARY_STUDENT_HEADERS.length);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureDashboardSheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.DASHBOARD_SHEET_NAME);
  ensureSheetGridSize_(sheet, 1, LIBRARY_DASHBOARD_HEADERS.length);
  if (sheet.getLastRow() === 0) {
    writeSheetRows_(sheet, 1, 1, [LIBRARY_DASHBOARD_HEADERS], LIBRARY_DASHBOARD_HEADERS.length);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureActiveStudentsSheet_(spreadsheet) {
  return ensureReadableStudentsSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.ACTIVE_STUDENTS_SHEET_NAME);
}

function ensureSelectedStudentsSheet_(spreadsheet) {
  return ensureReadableStudentsSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.SELECTED_STUDENTS_SHEET_NAME);
}

function ensureLeftStudentsSheet_(spreadsheet) {
  return ensureReadableStudentsSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.LEFT_STUDENTS_SHEET_NAME);
}

function ensureReadableStudentsSheet_(spreadsheet, sheetName) {
  var sheet = getOrCreateSheet_(spreadsheet, sheetName);
  ensureSheetGridSize_(sheet, 1, LIBRARY_STUDENT_HEADERS.length);
  if (sheet.getLastRow() === 0) {
    writeSheetRows_(sheet, 1, 1, [LIBRARY_STUDENT_HEADERS], LIBRARY_STUDENT_HEADERS.length);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureSeatHistorySheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.SEAT_HISTORY_SHEET_NAME);
  ensureSheetGridSize_(sheet, 1, LIBRARY_SEAT_HISTORY_HEADERS.length);
  if (sheet.getLastRow() === 0) {
    writeSheetRows_(sheet, 1, 1, [LIBRARY_SEAT_HISTORY_HEADERS], LIBRARY_SEAT_HISTORY_HEADERS.length);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureAdminSettingsSheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.ADMIN_SETTINGS_SHEET_NAME);
  ensureSheetGridSize_(sheet, 2, LIBRARY_ADMIN_SETTINGS_HEADERS.length);
  if (sheet.getLastRow() === 0) {
    writeSheetRows_(sheet, 1, 1, [
      LIBRARY_ADMIN_SETTINGS_HEADERS,
      [
        LIBRARY_ADMIN_PASSWORD_KEY,
        trimText_(LIBRARY_WEBAPP_CONFIG.DEFAULT_ADMIN_PANEL_PASSWORD),
        formatTimestampForSheet_(new Date())
      ]
    ], LIBRARY_ADMIN_SETTINGS_HEADERS.length);
    sheet.setFrozenRows(1);
  } else {
    writeSheetRows_(sheet, 1, 1, [LIBRARY_ADMIN_SETTINGS_HEADERS], LIBRARY_ADMIN_SETTINGS_HEADERS.length);
    ensureAdminSettingDefault_(sheet, LIBRARY_ADMIN_PASSWORD_KEY, LIBRARY_WEBAPP_CONFIG.DEFAULT_ADMIN_PANEL_PASSWORD);
  }
  hideSheetSafely_(spreadsheet, sheet);
  return sheet;
}

function ensureAdminSettingDefault_(sheet, key, fallbackValue) {
  if (findAdminSettingRow_(sheet, key) > 0) {
    return;
  }

  writeSheetRows_(sheet, sheet.getLastRow() + 1, 1, [[
    trimText_(key),
    trimText_(fallbackValue),
    formatTimestampForSheet_(new Date())
  ]], LIBRARY_ADMIN_SETTINGS_HEADERS.length);
}

function findAdminSettingRow_(sheet, key) {
  var normalizedKey = trimText_(key).toLowerCase();
  var dataRowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!normalizedKey || !dataRowCount) {
    return 0;
  }

  var values = sheet.getRange(2, 1, dataRowCount, 1).getValues();
  for (var index = 0; index < values.length; index++) {
    if (trimText_(values[index][0]).toLowerCase() === normalizedKey) {
      return index + 2;
    }
  }
  return 0;
}

function getAdminSettingValue_(spreadsheet, key, fallbackValue) {
  var sheet = ensureAdminSettingsSheet_(spreadsheet);
  var rowIndex = findAdminSettingRow_(sheet, key);
  if (!rowIndex) {
    return trimText_(fallbackValue);
  }

  var value = trimText_(sheet.getRange(rowIndex, 2).getValue());
  return value || trimText_(fallbackValue);
}

function setAdminSettingValue_(spreadsheet, key, value) {
  var sheet = ensureAdminSettingsSheet_(spreadsheet);
  var rowIndex = findAdminSettingRow_(sheet, key) || sheet.getLastRow() + 1;
  writeSheetRows_(sheet, rowIndex, 1, [[
    trimText_(key),
    trimText_(value),
    formatTimestampForSheet_(new Date())
  ]], LIBRARY_ADMIN_SETTINGS_HEADERS.length);
}

function getAdminPanelPassword_() {
  return getAdminSettingValue_(
    getLibrarySpreadsheet_(),
    LIBRARY_ADMIN_PASSWORD_KEY,
    LIBRARY_WEBAPP_CONFIG.DEFAULT_ADMIN_PANEL_PASSWORD
  );
}

function ensureLogSheet_(spreadsheet) {
  var sheet = getOrCreateSheet_(spreadsheet, LIBRARY_WEBAPP_CONFIG.LOG_SHEET_NAME);
  ensureSheetGridSize_(sheet, 1, LIBRARY_LOG_HEADERS.length);
  if (sheet.getLastRow() === 0) {
    writeSheetRows_(sheet, 1, 1, [LIBRARY_LOG_HEADERS], LIBRARY_LOG_HEADERS.length);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureSheetGridSize_(sheet, minRows, minColumns) {
  var requiredRows = Math.max(1, toNumber_(minRows, 1));
  var requiredColumns = Math.max(1, toNumber_(minColumns, 1));
  var missingRows = requiredRows - sheet.getMaxRows();
  var missingColumns = requiredColumns - sheet.getMaxColumns();

  if (missingRows > 0) {
    sheet.insertRowsAfter(sheet.getMaxRows(), missingRows);
  }
  if (missingColumns > 0) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), missingColumns);
  }
}

function writeSheetRows_(sheet, startRow, startColumn, rows, expectedColumns) {
  var safeRows = normalizeSheetRows_(rows, expectedColumns);
  ensureSheetGridSize_(sheet, startRow + safeRows.length - 1, startColumn + expectedColumns - 1);
  sheet.getRange(startRow, startColumn, safeRows.length, expectedColumns).setValues(safeRows);
}

function normalizeSheetRows_(rows, expectedColumns) {
  var width = Math.max(1, toNumber_(expectedColumns, 1));
  var source = Array.isArray(rows) ? rows : [];

  return source.map(function(row) {
    var next = Array.isArray(row) ? row.slice(0, width) : [row];
    while (next.length < width) {
      next.push("");
    }
    return next;
  });
}

function hideSheetSafely_(spreadsheet, sheet) {
  if (!sheet || spreadsheet.getSheets().length <= 1) {
    return;
  }
  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
}

function getOrCreateSheet_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  return sheet;
}

function getSheetIfExists_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name);
}

function getAlternateSlot_(slot) {
  return trimText_(slot) === "B" ? "A" : "B";
}

function createRevision_() {
  return "rev_" + String(Date.now()) + "_" + Utilities.getUuid().replace(/-/g, "");
}

function computeStateChecksum_(students) {
  return computeDigestHex_(JSON.stringify(finalizeStudentDataset_(students)));
}

function computeDigestHex_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ""),
    Utilities.Charset.UTF_8
  );
  var output = [];
  for (var index = 0; index < bytes.length; index++) {
    var next = (bytes[index] + 256) % 256;
    output.push((next < 16 ? "0" : "") + next.toString(16));
  }
  return output.join("");
}

function splitIntoChunks_(text, chunkSize) {
  var source = String(text || "");
  var size = Math.max(1000, toNumber_(chunkSize, 45000));
  var chunks = [];

  if (!source) {
    return [""];
  }

  for (var index = 0; index < source.length; index += size) {
    chunks.push(source.slice(index, index + size));
  }
  return chunks;
}

function finalizeStudentDataset_(list) {
  var source = Array.isArray(list) ? list : [];
  var merged = [];
  var indexById = {};
  var indexByFingerprint = {};

  source.forEach(function(item) {
    var candidate = isUiContentRecord_(item) ? normalizeUiContentRecord_(item) : normalizeStudentRecord_(item);
    var candidateId = trimText_(candidate.id);
    var fingerprint = isUiContentRecord_(candidate)
      ? LIBRARY_UI_CONTENT_RECORD_ID
      : buildStudentFingerprint_(candidate);
    var existingIndex = null;

    if (candidateId && indexById.hasOwnProperty(candidateId)) {
      existingIndex = indexById[candidateId];
    } else if (fingerprint && indexByFingerprint.hasOwnProperty(fingerprint)) {
      existingIndex = indexByFingerprint[fingerprint];
    }

    if (existingIndex === null || existingIndex === undefined) {
      merged.push(candidate);
      existingIndex = merged.length - 1;
    } else {
      merged[existingIndex] = isUiContentRecord_(candidate) || isUiContentRecord_(merged[existingIndex])
        ? mergeUiContentRecords_(merged[existingIndex], candidate)
        : mergeStudentRecords_(merged[existingIndex], candidate);
    }

    candidate = merged[existingIndex];
    if (trimText_(candidate.id)) {
      indexById[trimText_(candidate.id)] = existingIndex;
    }
    if (fingerprint) {
      indexByFingerprint[fingerprint] = existingIndex;
    }
  });

  var usedIds = {};
  merged = merged.map(function(student) {
    if (isUiContentRecord_(student)) {
      return normalizeUiContentRecord_(student);
    }
    var next = normalizeStudentRecord_(student);
    var id = trimText_(next.id) || createServerStudentId_();
    while (usedIds[id]) {
      id = createServerStudentId_();
    }
    usedIds[id] = true;
    next.id = id;
    return next;
  });

  var maxReadableCodeSequence = 0;
  var assignedReadableCodes = {};
  merged.forEach(function(student) {
    if (isUiContentRecord_(student)) {
      return;
    }
    var manualCode = normalizeReadableStudentCode_(student && student.manualSerialNo);
    if (!manualCode) {
      return;
    }

    maxReadableCodeSequence = Math.max(maxReadableCodeSequence, extractReadableStudentCodeSequence_(manualCode));
  });

  merged = merged.map(function(student) {
    if (isUiContentRecord_(student)) {
      return normalizeUiContentRecord_(student);
    }
    var next = normalizeStudentRecord_(student);
    var manualCode = normalizeReadableStudentCode_(next.manualSerialNo);

    if (!manualCode || assignedReadableCodes[manualCode]) {
      do {
        maxReadableCodeSequence += 1;
        manualCode = formatReadableStudentCode_(maxReadableCodeSequence);
      } while (assignedReadableCodes[manualCode]);
    }

    assignedReadableCodes[manualCode] = true;
    next.manualSerialNo = manualCode;
    return normalizeStudentRecord_(next);
  });

  merged.sort(function(left, right) {
    if (isUiContentRecord_(left) && !isUiContentRecord_(right)) {
      return 1;
    }
    if (!isUiContentRecord_(left) && isUiContentRecord_(right)) {
      return -1;
    }
    if (isUiContentRecord_(left) && isUiContentRecord_(right)) {
      return compareValues_(trimText_(left.id), trimText_(right.id));
    }
    return (
      compareValues_(toNumber_(left.seat, 0), toNumber_(right.seat, 0)) ||
      compareValues_(trimText_(left.slot), trimText_(right.slot)) ||
      compareValues_(trimText_(left.name), trimText_(right.name))
    );
  });

  return merged;
}

function mergeStudentCollections_(baseList, incomingList) {
  return finalizeStudentDataset_((Array.isArray(baseList) ? baseList : []).concat(Array.isArray(incomingList) ? incomingList : []));
}

function normalizeAdmissionMode_(value) {
  return trimText_(value).toLowerCase() === "flexible" ? "flexible" : "regular";
}

function isAssignedSeatStatus_(status) {
  var normalized = trimText_(status).toLowerCase();
  return normalized === "assigned" ||
    normalized === "manual_assigned" ||
    normalized === "random_assigned";
}

function normalizeSeatStatus_(status, admissionMode, seat) {
  var normalized = trimText_(status).toLowerCase();
  var mode = normalizeAdmissionMode_(admissionMode);
  var hasSeat = trimText_(seat) !== "";
  var allowed = {
    assigned: true,
    pending: true,
    random_assigned: true,
    manual_assigned: true,
    waiting: true,
    unassigned: true
  };

  if (allowed[normalized]) {
    if (!hasSeat && isAssignedSeatStatus_(normalized)) {
      return mode === "flexible" ? "unassigned" : "pending";
    }
    return normalized;
  }

  if (hasSeat) {
    return mode === "flexible" ? "manual_assigned" : "assigned";
  }

  return mode === "flexible" ? "unassigned" : "pending";
}

function buildSeatHistoryEventId_(options) {
  var safeOptions = options && typeof options === "object" ? options : {};
  return [
    trimText_(safeOptions.occurredAt) || new Date().toISOString(),
    trimText_(safeOptions.actionType || "seat_updated"),
    trimText_(safeOptions.oldSeat),
    trimText_(safeOptions.newSeat),
    trimText_(safeOptions.studentId),
    trimText_(safeOptions.changedBy || safeOptions.actor || safeOptions.assignedBy)
  ].filter(Boolean).join("_");
}

function normalizeSeatHistory_(list) {
  var source = Array.isArray(list) ? list : [];
  var seen = {};
  return source.map(function(item) {
    var entry = item && typeof item === "object" ? item : {};
    var occurredAt = trimText_(entry.occurredAt || entry.changedAt || entry.createdAt);
    var actionType = trimText_(entry.actionType || entry.action || "seat_updated").toLowerCase();
    var eventId = trimText_(entry.eventId || buildSeatHistoryEventId_({
      occurredAt: occurredAt,
      actionType: actionType,
      oldSeat: entry.oldSeat,
      newSeat: entry.newSeat,
      studentId: entry.studentId,
      changedBy: entry.changedBy || entry.assignedBy || entry.actor
    }));

    return {
      eventId: eventId,
      actionType: actionType || "seat_updated",
      oldSeat: trimText_(entry.oldSeat) === "" ? "" : toNumber_(entry.oldSeat, ""),
      newSeat: trimText_(entry.newSeat) === "" ? "" : toNumber_(entry.newSeat, ""),
      oldSeatStatus: trimText_(entry.oldSeatStatus).toLowerCase(),
      newSeatStatus: trimText_(entry.newSeatStatus).toLowerCase(),
      changedBy: trimText_(entry.changedBy || entry.assignedBy || entry.actor),
      occurredAt: occurredAt,
      note: trimText_(entry.note)
    };
  }).filter(function(entry) {
    if (!entry.eventId || seen[entry.eventId]) {
      return false;
    }
    seen[entry.eventId] = true;
    return true;
  }).sort(function(left, right) {
    return compareValues_(trimText_(left.occurredAt), trimText_(right.occurredAt));
  });
}

function mergeSeatHistory_(left, right) {
  return normalizeSeatHistory_([]
    .concat(Array.isArray(left) ? left : [])
    .concat(Array.isArray(right) ? right : []));
}

function createSeatHistoryEntry_(options) {
  var safeOptions = options && typeof options === "object" ? options : {};
  var occurredAt = trimText_(safeOptions.occurredAt) || new Date().toISOString();
  var actionType = trimText_(safeOptions.actionType || "seat_updated").toLowerCase();
  return {
    eventId: trimText_(safeOptions.eventId) || buildSeatHistoryEventId_({
      occurredAt: occurredAt,
      actionType: actionType,
      oldSeat: safeOptions.oldSeat,
      newSeat: safeOptions.newSeat,
      studentId: safeOptions.studentId,
      changedBy: safeOptions.changedBy || safeOptions.actor || safeOptions.assignedBy
    }),
    actionType: actionType || "seat_updated",
    oldSeat: trimText_(safeOptions.oldSeat) === "" ? "" : toNumber_(safeOptions.oldSeat, ""),
    newSeat: trimText_(safeOptions.newSeat) === "" ? "" : toNumber_(safeOptions.newSeat, ""),
    oldSeatStatus: trimText_(safeOptions.oldSeatStatus).toLowerCase(),
    newSeatStatus: trimText_(safeOptions.newSeatStatus).toLowerCase(),
    changedBy: trimText_(safeOptions.changedBy || safeOptions.assignedBy || safeOptions.actor),
    occurredAt: occurredAt,
    note: trimText_(safeOptions.note)
  };
}

function hasAssignedSeat_(student) {
  var safeStudent = student && typeof student === "object" ? student : {};
  return trimText_(safeStudent.seat) !== "" && isAssignedSeatStatus_(safeStudent.seatStatus);
}

function normalizeStudentRecord_(record) {
  var base = record && typeof record === "object" ? record : {};
  if (isUiContentRecord_(base)) {
    return normalizeUiContentRecord_(base);
  }
  var rawDeletedAt = toNumber_(base.deletedAt, 0);
  var rawSelectedAt = toNumber_(base.selectedAt, 0);
  var updatedAt = normalizeUpdatedAt_(base.updatedAt, base);
  var libraryStatus = normalizeLibraryStatus_(
    base.libraryStatus || base.studentLifecycleStatus || base.studentState,
    rawDeletedAt,
    rawSelectedAt
  );
  var admissionMode = normalizeAdmissionMode_(base.admissionMode);
  var seat = trimText_(base.seat) === "" ? "" : toNumber_(base.seat, "");
  var seatStatus = normalizeSeatStatus_(base.seatStatus, admissionMode, seat);
  var seatHistory = normalizeSeatHistory_(base.seatHistory);

  return {
    id: trimText_(base.id),
    name: trimText_(base.name),
    parentName: trimText_(base.parentName),
    seat: seat,
    mobile: trimText_(base.mobile),
    parentMobile: trimText_(base.parentMobile),
    addressType: normalizeAddressType_(base.addressType),
    localAddress: trimText_(base.localAddress),
    permanentAddress: trimText_(base.permanentAddress),
    studentAadharNo: normalizeAadharNumber_(base.studentAadharNo),
    manualSerialNo: normalizeReadableStudentCode_(base.manualSerialNo),
    lockerNo: trimText_(base.lockerNo),
    goal: trimText_(base.goal),
    fee: toNumber_(base.fee, 0),
    feePlan: normalizeFeePlan_(base.feePlan),
    admission: trimText_(base.admission),
    feedate: trimText_(base.feedate),
    slot: trimText_(base.slot),
    timeStart: normalizeTimeValue_(base.timeStart),
    timeEnd: normalizeTimeValue_(base.timeEnd),
    status: trimText_(base.status) === "Done" ? "Done" : "Pending",
    attendance: trimText_(base.attendance) === "Present" ? "Present" : "Absent",
    photo: trimText_(base.photo) || LIBRARY_WEBAPP_CONFIG.DEFAULT_PHOTO_URL,
    paidHistory: normalizePaidHistory_(base.paidHistory),
    updatedAt: updatedAt,
    attendanceMarkedAt: trimText_(base.attendanceMarkedAt),
    attendanceClearedAt: trimText_(base.attendanceClearedAt),
    attendanceHistory: Array.isArray(base.attendanceHistory)
      ? Array.from(new Set(base.attendanceHistory.map(trimText_).filter(Boolean))).sort().slice(-120)
      : [],
    lastAttendanceDate: trimText_(base.lastAttendanceDate),
    lastAttendanceTime: trimText_(base.lastAttendanceTime),
    lastAttendanceSlot: trimText_(base.lastAttendanceSlot),
    attendanceStreak: toNumber_(base.attendanceStreak, 0),
    absentDays: toNumber_(base.absentDays, 0),
    attendanceSource: trimText_(base.attendanceSource),
    lastPaymentCanUndo: toBoolean_(base.lastPaymentCanUndo, false),
    lastPaymentMarkAt: trimText_(base.lastPaymentMarkAt),
    lastPaymentPreviousDueDate: trimText_(base.lastPaymentPreviousDueDate),
    lastPaymentEntryDate: trimText_(base.lastPaymentEntryDate),
    lastPaymentEntryAmount: toNumber_(base.lastPaymentEntryAmount, 0),
    feeDueDate: trimText_(base.feeDueDate || base.feedate),
    lastPaidDate: trimText_(base.lastPaidDate),
    autoLeftReason: trimText_(base.autoLeftReason),
    autoLeftAt: trimText_(base.autoLeftAt),
    admissionMode: admissionMode,
    seatStatus: seatStatus,
    seatAssignedAt: hasAssignedSeat_({
      seat: seat,
      seatStatus: seatStatus
    }) ? trimText_(base.seatAssignedAt || base.admission) : "",
    seatAssignedBy: hasAssignedSeat_({
      seat: seat,
      seatStatus: seatStatus
    }) ? trimText_(base.seatAssignedBy) : "",
    seatHistory: seatHistory,
    libraryStatus: libraryStatus,
    selectedAt: libraryStatus === "selected" ? (rawSelectedAt || updatedAt) : 0,
    deletedAt: libraryStatus === "left" ? (rawDeletedAt || updatedAt) : 0
  };
}

function mergeStudentRecords_(left, right) {
  if (isUiContentRecord_(left) || isUiContentRecord_(right)) {
    return mergeUiContentRecords_(left, right);
  }
  var current = normalizeStudentRecord_(left);
  var incoming = normalizeStudentRecord_(right);
  var useIncoming = toNumber_(incoming.updatedAt, 0) >= toNumber_(current.updatedAt, 0);
  var newer = useIncoming ? incoming : current;
  var older = useIncoming ? current : incoming;
  var newerLibraryStatus = normalizeLibraryStatus_(newer.libraryStatus, newer.deletedAt, newer.selectedAt);
  var olderLibraryStatus = normalizeLibraryStatus_(older.libraryStatus, older.deletedAt, older.selectedAt);

  return normalizeStudentRecord_({
    id: trimText_(newer.id) || trimText_(older.id) || createServerStudentId_(),
    name: trimText_(newer.name) || trimText_(older.name),
    parentName: trimText_(newer.parentName) || trimText_(older.parentName),
    seat: trimText_(newer.seat) === "" && trimText_(older.seat) !== "" && !useIncoming ? older.seat : newer.seat,
    mobile: trimText_(newer.mobile) || trimText_(older.mobile),
    parentMobile: trimText_(newer.parentMobile) || trimText_(older.parentMobile),
    addressType: trimText_(newer.addressType) || trimText_(older.addressType),
    localAddress: trimText_(newer.localAddress) || trimText_(older.localAddress),
    permanentAddress: trimText_(newer.permanentAddress) || trimText_(older.permanentAddress),
    studentAadharNo: trimText_(newer.studentAadharNo) || trimText_(older.studentAadharNo),
    manualSerialNo: trimText_(newer.manualSerialNo) || trimText_(older.manualSerialNo),
    lockerNo: trimText_(newer.lockerNo) || trimText_(older.lockerNo),
    goal: trimText_(newer.goal) || trimText_(older.goal),
    fee: toNumber_(newer.fee, 0) || toNumber_(older.fee, 0),
    feePlan: trimText_(newer.feePlan) || trimText_(older.feePlan),
    admission: trimText_(newer.admission) || trimText_(older.admission),
    feedate: trimText_(newer.feedate) || trimText_(older.feedate),
    slot: trimText_(newer.slot) || trimText_(older.slot),
    timeStart: trimText_(newer.timeStart) || trimText_(older.timeStart),
    timeEnd: trimText_(newer.timeEnd) || trimText_(older.timeEnd),
    status: trimText_(newer.status) || trimText_(older.status),
    attendance: trimText_(newer.attendance) || trimText_(older.attendance),
    photo: pickPreferredPhoto_(newer.photo, older.photo),
    paidHistory: mergePaidHistory_(current.paidHistory, incoming.paidHistory),
    updatedAt: Math.max(toNumber_(current.updatedAt, 0), toNumber_(incoming.updatedAt, 0)) || Date.now(),
    attendanceMarkedAt: trimText_(newer.attendanceMarkedAt) || trimText_(older.attendanceMarkedAt),
    attendanceClearedAt: trimText_(newer.attendanceClearedAt) || trimText_(older.attendanceClearedAt),
    attendanceHistory: Array.from(new Set([].concat(
      Array.isArray(current.attendanceHistory) ? current.attendanceHistory : [],
      Array.isArray(incoming.attendanceHistory) ? incoming.attendanceHistory : []
    ).map(trimText_).filter(Boolean))).sort().slice(-120),
    lastAttendanceDate: trimText_(newer.lastAttendanceDate) || trimText_(older.lastAttendanceDate),
    lastAttendanceTime: trimText_(newer.lastAttendanceTime) || trimText_(older.lastAttendanceTime),
    lastAttendanceSlot: trimText_(newer.lastAttendanceSlot) || trimText_(older.lastAttendanceSlot),
    attendanceStreak: Math.max(toNumber_(newer.attendanceStreak, 0), toNumber_(older.attendanceStreak, 0)),
    absentDays: Math.max(toNumber_(newer.absentDays, 0), toNumber_(older.absentDays, 0)),
    attendanceSource: trimText_(newer.attendanceSource) || trimText_(older.attendanceSource),
    lastPaymentCanUndo: toBoolean_(newer.lastPaymentCanUndo, false) || toBoolean_(older.lastPaymentCanUndo, false),
    lastPaymentMarkAt: trimText_(newer.lastPaymentMarkAt) || trimText_(older.lastPaymentMarkAt),
    lastPaymentPreviousDueDate: trimText_(newer.lastPaymentPreviousDueDate) || trimText_(older.lastPaymentPreviousDueDate),
    lastPaymentEntryDate: trimText_(newer.lastPaymentEntryDate) || trimText_(older.lastPaymentEntryDate),
    lastPaymentEntryAmount: Math.max(toNumber_(newer.lastPaymentEntryAmount, 0), toNumber_(older.lastPaymentEntryAmount, 0)),
    feeDueDate: trimText_(newer.feeDueDate) || trimText_(newer.feedate) || trimText_(older.feeDueDate) || trimText_(older.feedate),
    lastPaidDate: trimText_(newer.lastPaidDate) || trimText_(older.lastPaidDate),
    autoLeftReason: trimText_(newer.autoLeftReason) || trimText_(older.autoLeftReason),
    autoLeftAt: trimText_(newer.autoLeftAt) || trimText_(older.autoLeftAt),
    admissionMode: trimText_(newer.admissionMode) || trimText_(older.admissionMode) || "regular",
    seatStatus: trimText_(newer.seatStatus) || trimText_(older.seatStatus),
    seatAssignedAt: trimText_(newer.seat) === ""
      ? ""
      : (trimText_(newer.seatAssignedAt) || trimText_(older.seatAssignedAt)),
    seatAssignedBy: trimText_(newer.seat) === ""
      ? ""
      : (trimText_(newer.seatAssignedBy) || trimText_(older.seatAssignedBy)),
    seatHistory: mergeSeatHistory_(current.seatHistory, incoming.seatHistory),
    libraryStatus: newerLibraryStatus || olderLibraryStatus || "active",
    selectedAt: newerLibraryStatus === "selected"
      ? (toNumber_(newer.selectedAt, 0) || Date.now())
      : olderLibraryStatus === "selected" && !useIncoming
        ? toNumber_(older.selectedAt, 0)
        : 0,
    deletedAt: newerLibraryStatus === "left"
      ? (toNumber_(newer.deletedAt, 0) || Date.now())
      : 0
  });
}

function getStudentRecordOrThrow_(list, studentId) {
  var targetId = trimText_(studentId);
  var targetStudent = finalizeStudentDataset_(list).filter(function(student) {
    return trimText_(student && student.id) === targetId ||
      normalizeReadableStudentCode_(student && student.manualSerialNo) === normalizeReadableStudentCode_(targetId);
  })[0] || null;

  if (!targetStudent) {
    throw createAppError_("STUDENT_NOT_FOUND", "Student record nahi mila.");
  }

  return normalizeStudentRecord_(targetStudent);
}

function validateSeatAssignment_(list, candidate, excludeId) {
  var seat = toNumber_(candidate && candidate.seat, 0);
  var slot = trimText_(candidate && candidate.slot);
  var normalizedExcludeId = trimText_(excludeId);
  var activeStudents = finalizeStudentDataset_(list).filter(function(student) {
    return isStudentActive_(student);
  });
  var seatStudents = activeStudents.filter(function(student) {
    return toNumber_(student && student.seat, 0) === seat && trimText_(student && student.id) !== normalizedExcludeId;
  });

  if (!seat) {
    return {
      ok: false,
      code: "SEAT_REQUIRED",
      message: "Seat number required hai."
    };
  }
  if (seat < 1 || seat > 100) {
    return {
      ok: false,
      code: "SEAT_RANGE",
      message: "Seat number 1 se 100 ke beech hona chahiye."
    };
  }
  if (slot && seatStudents.some(function(student) {
    return trimText_(student && student.slot) === slot;
  })) {
    return {
      ok: false,
      code: "SEAT_SLOT_DUPLICATE",
      message: "Same seat & same slot already booked!"
    };
  }
  if (seatStudents.length >= 4) {
    return {
      ok: false,
      code: "SEAT_FULL",
      message: "Is seat par already 4 students hain!"
    };
  }
  return {
    ok: true,
    code: "OK",
    message: ""
  };
}

function pickRandomAvailableSeat_(list, candidate, excludeId) {
  var availableSeats = [];
  for (var seat = 1; seat <= 100; seat++) {
    var validation = validateSeatAssignment_(list, objectAssign_({}, candidate, {
      seat: seat
    }), excludeId);
    if (validation.ok) {
      availableSeats.push(seat);
    }
  }

  if (!availableSeats.length) {
    return {
      ok: true,
      seat: "",
      seatStatus: "waiting",
      waiting: true,
      message: "No seat available right now."
    };
  }

  var index = Math.floor(Math.random() * availableSeats.length);
  return {
    ok: true,
    seat: availableSeats[index],
    seatStatus: "random_assigned",
    waiting: false,
    message: ""
  };
}

function resolveSeatPlan_(list, candidate, options) {
  var safeOptions = options && typeof options === "object" ? options : {};
  var previousStudent = normalizeStudentRecord_(safeOptions.previousStudent || {});
  var admissionMode = normalizeAdmissionMode_(safeOptions.admissionMode || candidate && candidate.admissionMode || previousStudent.admissionMode);
  var seatAction = trimText_(safeOptions.seatAction).toLowerCase();
  var occurredAt = trimText_(safeOptions.occurredAt) || new Date().toISOString();
  var actor = trimText_(safeOptions.actor);
  var excludeId = trimText_(safeOptions.excludeId);

  if (admissionMode === "regular") {
    var regularValidation = validateSeatAssignment_(list, candidate, excludeId);
    if (!regularValidation.ok) {
      return regularValidation;
    }
    return {
      ok: true,
      admissionMode: "regular",
      seat: toNumber_(candidate && candidate.seat, ""),
      seatStatus: "assigned",
      seatAssignedAt: trimText_(previousStudent.seatAssignedAt) || occurredAt,
      seatAssignedBy: trimText_(previousStudent.seatAssignedBy) || actor,
      actionType: "regular_assigned",
      message: ""
    };
  }

  if (seatAction === "assign_later") {
    return {
      ok: true,
      admissionMode: "flexible",
      seat: "",
      seatStatus: "unassigned",
      seatAssignedAt: "",
      seatAssignedBy: "",
      actionType: hasAssignedSeat_(previousStudent) ? "remove_seat" : "assign_later",
      message: ""
    };
  }

  if (seatAction === "random_now") {
    var randomSeatResult = pickRandomAvailableSeat_(list, candidate, excludeId);
    if (!randomSeatResult.ok) {
      return randomSeatResult;
    }
    if (!randomSeatResult.seat) {
      return {
        ok: true,
        admissionMode: "flexible",
        seat: "",
        seatStatus: "waiting",
        seatAssignedAt: "",
        seatAssignedBy: "",
        actionType: "waiting_for_seat",
        message: randomSeatResult.message
      };
    }
    return {
      ok: true,
      admissionMode: "flexible",
      seat: randomSeatResult.seat,
      seatStatus: "random_assigned",
      seatAssignedAt: occurredAt,
      seatAssignedBy: actor,
      actionType: "random_assign",
      message: ""
    };
  }

  var manualValidation = validateSeatAssignment_(list, candidate, excludeId);
  if (!manualValidation.ok) {
    return manualValidation;
  }
  return {
    ok: true,
    admissionMode: "flexible",
    seat: toNumber_(candidate && candidate.seat, ""),
    seatStatus: "manual_assigned",
    seatAssignedAt: occurredAt,
    seatAssignedBy: actor,
    actionType: hasAssignedSeat_(previousStudent) ? "change_seat" : "manual_assign",
    message: ""
  };
}

function applySeatPlanToStudent_(student, plan, options) {
  var safeOptions = options && typeof options === "object" ? options : {};
  var base = normalizeStudentRecord_(student);
  var occurredAt = trimText_(safeOptions.occurredAt || plan && plan.seatAssignedAt) || new Date().toISOString();
  var actor = trimText_(safeOptions.actor || plan && plan.seatAssignedBy);
  var nextSeat = trimText_(plan && plan.seat) === "" ? "" : toNumber_(plan && plan.seat, "");
  var nextMode = normalizeAdmissionMode_(plan && plan.admissionMode || base.admissionMode);
  var nextStatus = normalizeSeatStatus_(plan && plan.seatStatus, nextMode, nextSeat);
  var nextAssignedAt = nextSeat ? trimText_(plan && plan.seatAssignedAt) || occurredAt : "";
  var nextAssignedBy = nextSeat ? trimText_(plan && plan.seatAssignedBy) || actor : "";
  var changed = base.admissionMode !== nextMode ||
    trimText_(base.seat) !== trimText_(nextSeat) ||
    trimText_(base.seatStatus) !== trimText_(nextStatus);
  var nextHistory = mergeSeatHistory_(base.seatHistory, []);

  if (changed && safeOptions.skipHistory !== true) {
    nextHistory = mergeSeatHistory_(nextHistory, [createSeatHistoryEntry_({
      eventId: trimText_(plan && plan.eventId),
      studentId: trimText_(base.id),
      actionType: trimText_(plan && plan.actionType) || "seat_updated",
      oldSeat: base.seat,
      newSeat: nextSeat,
      oldSeatStatus: base.seatStatus,
      newSeatStatus: nextStatus,
      changedBy: nextAssignedBy || actor,
      occurredAt: occurredAt,
      note: trimText_(plan && plan.message)
    })]);
  }

  return objectAssign_({}, base, {
    admissionMode: nextMode,
    seat: nextSeat,
    seatStatus: nextStatus,
    seatAssignedAt: nextAssignedAt,
    seatAssignedBy: nextAssignedBy,
    seatHistory: nextHistory
  });
}

function applySeatMutationToState_(currentState, studentId, seatAction, request) {
  var currentStudents = finalizeStudentDataset_(currentState && currentState.students);
  var targetStudent = getStudentRecordOrThrow_(currentStudents, studentId);
  var occurredAt = trimText_(request && request.occurredAt) || new Date().toISOString();
  var actor = trimText_(request && (request.assignedBy || request.actor)) || "admin_panel";
  var safeSeatAction = trimText_(seatAction).toLowerCase();

  if (normalizeAdmissionMode_(targetStudent.admissionMode) !== "flexible") {
    throw createAppError_("INVALID_ADMISSION_MODE", "Seat later actions sirf flexible admission par allowed hain.");
  }
  if (!isStudentActive_(targetStudent)) {
    throw createAppError_("INVALID_ADMISSION_STATE", "Seat later actions sirf active admissions par allowed hain.");
  }

  var resolvedSeatPlan = safeSeatAction === "assign_later"
    ? {
        ok: true,
        admissionMode: "flexible",
        seat: "",
        seatStatus: "unassigned",
        seatAssignedAt: "",
        seatAssignedBy: "",
        actionType: hasAssignedSeat_(targetStudent) ? "remove_seat" : "assign_later",
        message: ""
      }
    : resolveSeatPlan_(currentStudents, objectAssign_({}, targetStudent, {
        seat: trimText_(request && request.seat) === "" ? "" : toNumber_(request && request.seat, "")
      }), {
        admissionMode: "flexible",
        seatAction: safeSeatAction,
        previousStudent: targetStudent,
        excludeId: trimText_(targetStudent.id),
        occurredAt: occurredAt,
        actor: actor
      });

  if (!resolvedSeatPlan || resolvedSeatPlan.ok !== true) {
    throw createAppError_(trimText_(resolvedSeatPlan && resolvedSeatPlan.code) || "SEAT_UPDATE_FAILED", trimText_(resolvedSeatPlan && resolvedSeatPlan.message) || "Seat update fail hui.");
  }

  var updatedStudent = normalizeStudentRecord_(objectAssign_({}, applySeatPlanToStudent_(targetStudent, resolvedSeatPlan, {
    occurredAt: occurredAt,
    actor: actor
  }), {
    updatedAt: Date.now()
  }));
  var nextStudents = currentStudents.map(function(student) {
    return trimText_(student && student.id) === trimText_(targetStudent.id) ? updatedStudent : student;
  });
  var actionMap = {
    manual_now: "assign_seat_manual",
    random_now: "assign_seat_random",
    assign_later: "remove_seat"
  };
  var messageMap = {
    manual_now: "Seat manually assigned.",
    random_now: trimText_(resolvedSeatPlan.message) || "Random seat processed.",
    assign_later: "Seat status updated to assign later."
  };

  return {
    state: commitState_(nextStudents, {
      action: actionMap[safeSeatAction] || "seat_update",
      previousRevision: trimText_(currentState && currentState.revision),
      message: messageMap[safeSeatAction] || "Seat updated."
    }),
    message: trimText_(resolvedSeatPlan.message) || messageMap[safeSeatAction] || "Seat updated."
  };
}

function buildSeatHistorySheetRow_(student, historyEntry, revision) {
  var safeStudent = normalizeStudentRecord_(student);
  var safeEntry = createSeatHistoryEntry_(historyEntry);
  return [
    trimText_(safeEntry.eventId),
    trimText_(safeStudent.id),
    trimText_(safeStudent.manualSerialNo),
    trimText_(safeStudent.name),
    normalizeAdmissionMode_(safeStudent.admissionMode),
    trimText_(safeEntry.actionType),
    trimText_(safeEntry.oldSeat) === "" ? "" : toNumber_(safeEntry.oldSeat, ""),
    trimText_(safeEntry.newSeat) === "" ? "" : toNumber_(safeEntry.newSeat, ""),
    trimText_(safeEntry.oldSeatStatus),
    trimText_(safeEntry.newSeatStatus),
    trimText_(safeEntry.changedBy),
    trimText_(safeEntry.occurredAt),
    trimText_(safeEntry.note),
    trimText_(revision)
  ];
}

function appendSeatHistoryDiff_(spreadsheet, previousStudents, nextStudents, revision) {
  var previousEventMap = {};
  finalizeStudentDataset_(previousStudents).forEach(function(student) {
    normalizeSeatHistory_(student && student.seatHistory).forEach(function(entry) {
      previousEventMap[trimText_(entry.eventId)] = true;
    });
  });

  var rows = [];
  finalizeStudentDataset_(nextStudents).forEach(function(student) {
    var safeStudent = normalizeStudentRecord_(student);
    normalizeSeatHistory_(safeStudent.seatHistory).forEach(function(entry) {
      var eventId = trimText_(entry.eventId);
      if (!eventId || previousEventMap[eventId]) {
        return;
      }
      previousEventMap[eventId] = true;
      rows.push(buildSeatHistorySheetRow_(safeStudent, entry, revision));
    });
  });

  if (!rows.length) {
    return;
  }

  var sheet = ensureSeatHistorySheet_(spreadsheet);
  writeSheetRows_(sheet, sheet.getLastRow() + 1, 1, rows, LIBRARY_SEAT_HISTORY_HEADERS.length);
}

function normalizePaidHistory_(list) {
  var source = Array.isArray(list) ? list : [];
  return source
    .map(function(item) {
      return {
        amount: toNumber_(item && item.amount, 0),
        date: trimText_(item && item.date)
      };
    })
    .filter(function(item) {
      return item.amount || item.date;
    });
}

function mergePaidHistory_(left, right) {
  var mergedMap = {};
  normalizePaidHistory_(left).concat(normalizePaidHistory_(right)).forEach(function(entry) {
    var key = trimText_(entry.date) + "|" + String(toNumber_(entry.amount, 0));
    if (!mergedMap[key]) {
      mergedMap[key] = entry;
    }
  });
  return Object.keys(mergedMap)
    .sort()
    .map(function(key) {
      return mergedMap[key];
    });
}

function buildStudentFingerprint_(student) {
  var seatValue = trimText_(student.seat) === "" ? "" : String(toNumber_(student.seat, ""));
  return [
    trimText_(student.name).toLowerCase(),
    normalizePhone_(student.mobile),
    seatValue,
    trimText_(student.slot).toLowerCase()
  ].join("|");
}

function pickPreferredPhoto_(primaryPhoto, secondaryPhoto) {
  var first = trimText_(primaryPhoto);
  var second = trimText_(secondaryPhoto);

  if (!first) {
    return second || LIBRARY_WEBAPP_CONFIG.DEFAULT_PHOTO_URL;
  }
  if (!second) {
    return first;
  }
  if (first === LIBRARY_WEBAPP_CONFIG.DEFAULT_PHOTO_URL) {
    return second;
  }
  if (second === LIBRARY_WEBAPP_CONFIG.DEFAULT_PHOTO_URL) {
    return first;
  }
  return first.length >= second.length ? first : second;
}

function normalizeUpdatedAt_(value, record) {
  var updatedAt = toNumber_(value, 0);
  if (updatedAt > 0) {
    return updatedAt;
  }

  var fallbackDate = Date.parse(trimText_(record && record.admission) || trimText_(record && record.feedate) || "");
  return isFinite(fallbackDate) && fallbackDate > 0 ? fallbackDate : Date.now();
}

function createServerStudentId_() {
  return "srv_" + String(Date.now()) + "_" + Utilities.getUuid().replace(/-/g, "").slice(0, 10);
}

function extractReadableStudentCodeSequence_(value) {
  var normalized = trimText_(value).toUpperCase();
  var match = normalized.match(new RegExp("^" + LIBRARY_READABLE_STUDENT_CODE_PREFIX + "-(\\d+)$"));
  return match ? toNumber_(match[1], 0) : 0;
}

function formatReadableStudentCode_(sequence) {
  var next = Math.max(1, toNumber_(sequence, 1));
  return LIBRARY_READABLE_STUDENT_CODE_PREFIX + "-" + String(next).padStart(LIBRARY_READABLE_STUDENT_CODE_PAD, "0");
}

function normalizeReadableStudentCode_(value) {
  var text = trimText_(value).toUpperCase().replace(/\s+/g, "").replace(/_/g, "-");
  if (!text) {
    return "";
  }

  var sequence = extractReadableStudentCodeSequence_(text);
  return sequence > 0 ? formatReadableStudentCode_(sequence) : text;
}

function normalizeAddressType_(value) {
  return trimText_(value).toLowerCase() === "permanent" ? "permanent" : "local";
}

function normalizeAadharNumber_(value) {
  return trimText_(value).replace(/\D+/g, "").slice(0, 12);
}

function normalizeFeePlan_(value) {
  var normalized = trimText_(value).toLowerCase();
  if (normalized === "half yearly" || normalized === "halfyearly" || normalized === "half_yearly" || normalized === "6_months") {
    return "half_yearly";
  }
  if (normalized === "yearly" || normalized === "annual" || normalized === "12_months") {
    return "yearly";
  }
  return "monthly";
}

function normalizeTimeValue_(value) {
  var match = trimText_(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return trimText_(value);
  }
  return padNumber_(match[1]) + ":" + padNumber_(match[2]);
}

function normalizePhone_(value) {
  var digits = trimText_(value).replace(/\D/g, "");
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

function normalizeAction_(value) {
  return trimText_(value).toLowerCase();
}

function looksLikeJson_(text) {
  var value = trimText_(text);
  return value.indexOf("{") === 0 || value.indexOf("[") === 0;
}

function parseJsonSafely_(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function decodeUriComponentSafe_(value) {
  try {
    return decodeURIComponent(trimText_(value));
  } catch (error) {
    return trimText_(value);
  }
}

function objectAssign_(target) {
  var output = target || {};
  for (var index = 1; index < arguments.length; index++) {
    var source = arguments[index] || {};
    Object.keys(source).forEach(function(key) {
      output[key] = source[key];
    });
  }
  return output;
}

function createAppError_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function trimText_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function toNumber_(value, fallback) {
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : fallback;
}

function toNumberOrBlank_(value) {
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : "";
}

function toBoolean_(value, fallback) {
  if (value === true || value === false) {
    return value;
  }

  var normalized = trimText_(value).toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return Boolean(fallback);
}

function compareValues_(left, right) {
  if (left === right) {
    return 0;
  }
  return left > right ? 1 : -1;
}

function padNumber_(value) {
  return String(value).padStart(2, "0");
}

function formatTimestampForSheet_(date) {
  return Utilities.formatDate(date, LIBRARY_WEBAPP_CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}
