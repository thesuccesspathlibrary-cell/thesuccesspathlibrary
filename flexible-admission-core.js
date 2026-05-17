(function(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.FlexibleAdmissionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    const ADMISSION_MODES = {
        REGULAR: "regular",
        FLEXIBLE: "flexible"
    };

    const SEAT_STATUSES = {
        ASSIGNED: "assigned",
        PENDING: "pending",
        RANDOM_ASSIGNED: "random_assigned",
        MANUAL_ASSIGNED: "manual_assigned",
        WAITING: "waiting",
        UNASSIGNED: "unassigned"
    };

    const SEAT_ACTIONS = {
        REGULAR: "regular",
        ASSIGN_LATER: "assign_later",
        RANDOM_NOW: "random_now",
        MANUAL_NOW: "manual_now"
    };

    const SEAT_STATUS_LABELS = {
        assigned: "Seat Assigned",
        pending: "Pending",
        random_assigned: "Seat Assigned",
        manual_assigned: "Seat Assigned",
        waiting: "Waiting",
        unassigned: "Unassigned"
    };

    function trimText(value) {
        return String(value == null ? "" : value).trim();
    }

    function toFiniteNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function normalizeAdmissionMode(mode) {
        return trimText(mode).toLowerCase() === ADMISSION_MODES.FLEXIBLE
            ? ADMISSION_MODES.FLEXIBLE
            : ADMISSION_MODES.REGULAR;
    }

    function normalizeSeatAction(action, admissionMode) {
        const mode = normalizeAdmissionMode(admissionMode);
        const normalized = trimText(action).toLowerCase();

        if (mode === ADMISSION_MODES.REGULAR) {
            return SEAT_ACTIONS.REGULAR;
        }

        if (normalized === SEAT_ACTIONS.RANDOM_NOW) {
            return SEAT_ACTIONS.RANDOM_NOW;
        }
        if (normalized === SEAT_ACTIONS.MANUAL_NOW) {
            return SEAT_ACTIONS.MANUAL_NOW;
        }
        return SEAT_ACTIONS.ASSIGN_LATER;
    }

    function isAssignedSeatStatus(status) {
        const normalized = trimText(status).toLowerCase();
        return normalized === SEAT_STATUSES.ASSIGNED ||
            normalized === SEAT_STATUSES.MANUAL_ASSIGNED ||
            normalized === SEAT_STATUSES.RANDOM_ASSIGNED;
    }

    function hasAssignedSeat(studentOrSeat, status) {
        if (studentOrSeat && typeof studentOrSeat === "object") {
            return trimText(studentOrSeat.seat) !== "" && isAssignedSeatStatus(studentOrSeat.seatStatus);
        }
        return trimText(studentOrSeat) !== "" && isAssignedSeatStatus(status);
    }

    function normalizeSeatStatus(status, admissionMode, seat) {
        const normalized = trimText(status).toLowerCase();
        const mode = normalizeAdmissionMode(admissionMode);
        const hasSeat = trimText(seat) !== "";

        if (normalized && Object.prototype.hasOwnProperty.call(SEAT_STATUS_LABELS, normalized)) {
            if (!hasSeat && isAssignedSeatStatus(normalized)) {
                return mode === ADMISSION_MODES.FLEXIBLE ? SEAT_STATUSES.UNASSIGNED : SEAT_STATUSES.PENDING;
            }
            return normalized;
        }

        if (hasSeat) {
            return mode === ADMISSION_MODES.FLEXIBLE ? SEAT_STATUSES.MANUAL_ASSIGNED : SEAT_STATUSES.ASSIGNED;
        }

        return mode === ADMISSION_MODES.FLEXIBLE ? SEAT_STATUSES.UNASSIGNED : SEAT_STATUSES.PENDING;
    }

    function normalizeSeatHistory(list) {
        const seen = new Set();
        return (Array.isArray(list) ? list : [])
            .map(item => {
                const entry = item && typeof item === "object" ? item : {};
                const occurredAt = trimText(entry.occurredAt || entry.changedAt || entry.createdAt);
                const actionType = trimText(entry.actionType || entry.action || "seat_updated").toLowerCase() || "seat_updated";
                const eventId = trimText(entry.eventId || buildSeatHistoryEventId({
                    occurredAt,
                    actionType,
                    oldSeat: entry.oldSeat,
                    newSeat: entry.newSeat,
                    changedBy: entry.changedBy || entry.assignedBy || entry.actor
                }));

                return {
                    eventId,
                    actionType,
                    oldSeat: trimText(entry.oldSeat) === "" ? "" : toFiniteNumber(entry.oldSeat, ""),
                    newSeat: trimText(entry.newSeat) === "" ? "" : toFiniteNumber(entry.newSeat, ""),
                    oldSeatStatus: trimText(entry.oldSeatStatus).toLowerCase(),
                    newSeatStatus: trimText(entry.newSeatStatus).toLowerCase(),
                    changedBy: trimText(entry.changedBy || entry.assignedBy || entry.actor),
                    occurredAt,
                    note: trimText(entry.note)
                };
            })
            .filter(entry => {
                if (!entry.eventId || seen.has(entry.eventId)) {
                    return false;
                }
                seen.add(entry.eventId);
                return true;
            })
            .sort((left, right) => trimText(left.occurredAt).localeCompare(trimText(right.occurredAt)));
    }

    function mergeSeatHistory(current, incoming) {
        return normalizeSeatHistory([]
            .concat(Array.isArray(current) ? current : [])
            .concat(Array.isArray(incoming) ? incoming : []));
    }

    function buildSeatHistoryEventId(options) {
        const safeOptions = options && typeof options === "object" ? options : {};
        return [
            trimText(safeOptions.occurredAt) || new Date().toISOString(),
            trimText(safeOptions.actionType || "seat_updated"),
            trimText(safeOptions.oldSeat),
            trimText(safeOptions.newSeat),
            trimText(safeOptions.studentId),
            trimText(safeOptions.changedBy || safeOptions.actor || safeOptions.assignedBy)
        ].filter(Boolean).join("_");
    }

    function createSeatHistoryEntry(options) {
        const safeOptions = options && typeof options === "object" ? options : {};
        const occurredAt = trimText(safeOptions.occurredAt) || new Date().toISOString();
        const actionType = trimText(safeOptions.actionType || "seat_updated").toLowerCase();
        return {
            eventId: trimText(safeOptions.eventId) || buildSeatHistoryEventId({
                occurredAt,
                actionType,
                oldSeat: safeOptions.oldSeat,
                newSeat: safeOptions.newSeat,
                studentId: safeOptions.studentId,
                changedBy: safeOptions.changedBy || safeOptions.actor || safeOptions.assignedBy
            }),
            actionType,
            oldSeat: trimText(safeOptions.oldSeat) === "" ? "" : toFiniteNumber(safeOptions.oldSeat, ""),
            newSeat: trimText(safeOptions.newSeat) === "" ? "" : toFiniteNumber(safeOptions.newSeat, ""),
            oldSeatStatus: trimText(safeOptions.oldSeatStatus).toLowerCase(),
            newSeatStatus: trimText(safeOptions.newSeatStatus).toLowerCase(),
            changedBy: trimText(safeOptions.changedBy || safeOptions.actor || safeOptions.assignedBy),
            occurredAt,
            note: trimText(safeOptions.note)
        };
    }

    function normalizeStudentSeatFields(record) {
        const base = record && typeof record === "object" ? record : {};
        const admissionMode = normalizeAdmissionMode(base.admissionMode);
        const seat = trimText(base.seat) === "" ? "" : toFiniteNumber(base.seat, "");
        const seatStatus = normalizeSeatStatus(base.seatStatus, admissionMode, seat);
        const seatHistory = normalizeSeatHistory(base.seatHistory);
        const seatAssignedAt = hasAssignedSeat(seat, seatStatus)
            ? trimText(base.seatAssignedAt || base.admission)
            : "";
        const seatAssignedBy = hasAssignedSeat(seat, seatStatus)
            ? trimText(base.seatAssignedBy)
            : "";

        return {
            admissionMode,
            seat,
            seatStatus,
            seatAssignedAt,
            seatAssignedBy,
            seatHistory
        };
    }

    function getSeatStatusLabel(status) {
        const normalized = trimText(status).toLowerCase();
        return SEAT_STATUS_LABELS[normalized] || "Pending";
    }

    function validateSeatAssignment(list, candidate, options) {
        const safeOptions = options && typeof options === "object" ? options : {};
        const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};
        const maxSeatNumber = Math.max(1, toFiniteNumber(safeOptions.maxSeatNumber, 100));
        const maxPerSeat = Math.max(1, toFiniteNumber(safeOptions.maxPerSeat, 4));
        const seat = toFiniteNumber(safeCandidate.seat, 0);
        const slot = trimText(safeCandidate.slot);
        const excludeId = trimText(safeOptions.excludeId);
        const source = Array.isArray(list) ? list : [];

        if (!seat) {
            return { ok: false, code: "SEAT_REQUIRED", message: "Seat number required hai." };
        }
        if (seat < 1 || seat > maxSeatNumber) {
            return { ok: false, code: "SEAT_RANGE", message: `Seat number 1 se ${maxSeatNumber} ke beech hona chahiye.` };
        }

        const seatStudents = source.filter(student => {
            const studentId = trimText(student && student.id);
            return toFiniteNumber(student && student.seat, 0) === seat && studentId !== excludeId;
        });

        if (slot && seatStudents.some(student => trimText(student && student.slot) === slot)) {
            return { ok: false, code: "SEAT_SLOT_DUPLICATE", message: "Same seat & same slot already booked!" };
        }

        if (seatStudents.length >= maxPerSeat) {
            return { ok: false, code: "SEAT_FULL", message: `Is seat par already ${maxPerSeat} students hain!` };
        }

        return { ok: true, code: "OK", message: "" };
    }

    function pickAvailableSeats(list, candidate, options) {
        const safeOptions = options && typeof options === "object" ? options : {};
        const maxSeatNumber = Math.max(1, toFiniteNumber(safeOptions.maxSeatNumber, 100));
        const availableSeats = [];

        for (let seat = 1; seat <= maxSeatNumber; seat += 1) {
            const result = validateSeatAssignment(list, {
                ...candidate,
                seat
            }, safeOptions);

            if (result.ok) {
                availableSeats.push(seat);
            }
        }

        return availableSeats;
    }

    function pickRandomSeat(list, candidate, options) {
        const safeOptions = options && typeof options === "object" ? options : {};
        const availableSeats = pickAvailableSeats(list, candidate, safeOptions);
        if (!availableSeats.length) {
            return {
                ok: true,
                seat: "",
                seatStatus: SEAT_STATUSES.WAITING,
                availableSeats,
                waiting: true,
                message: "No seat available right now."
            };
        }

        const randomValue = typeof safeOptions.randomValue === "number"
            ? safeOptions.randomValue
            : Math.random();
        const index = Math.min(
            availableSeats.length - 1,
            Math.max(0, Math.floor(Math.abs(randomValue) * availableSeats.length))
        );

        return {
            ok: true,
            seat: availableSeats[index],
            seatStatus: SEAT_STATUSES.RANDOM_ASSIGNED,
            availableSeats,
            waiting: false,
            message: ""
        };
    }

    function resolveSeatPlan(list, candidate, options) {
        const safeOptions = options && typeof options === "object" ? options : {};
        const baseStudent = safeOptions.previousStudent && typeof safeOptions.previousStudent === "object"
            ? safeOptions.previousStudent
            : {};
        const baseSeatState = normalizeStudentSeatFields(baseStudent);
        const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};
        const admissionMode = normalizeAdmissionMode(
            safeOptions.admissionMode || safeCandidate.admissionMode || baseSeatState.admissionMode
        );
        const seatAction = normalizeSeatAction(
            safeOptions.seatAction || safeCandidate.seatAction,
            admissionMode
        );
        const occurredAt = trimText(safeOptions.occurredAt) || new Date().toISOString();
        const actor = trimText(safeOptions.actor);

        if (admissionMode === ADMISSION_MODES.REGULAR) {
            const result = validateSeatAssignment(list, safeCandidate, safeOptions);
            if (!result.ok) {
                return result;
            }

            return {
                ok: true,
                admissionMode,
                seat: toFiniteNumber(safeCandidate.seat, ""),
                seatStatus: SEAT_STATUSES.ASSIGNED,
                seatAssignedAt: trimText(baseSeatState.seatAssignedAt) || occurredAt,
                seatAssignedBy: trimText(baseSeatState.seatAssignedBy) || actor,
                actionType: "regular_assigned",
                message: ""
            };
        }

        if (seatAction === SEAT_ACTIONS.ASSIGN_LATER) {
            return {
                ok: true,
                admissionMode,
                seat: "",
                seatStatus: SEAT_STATUSES.UNASSIGNED,
                seatAssignedAt: "",
                seatAssignedBy: "",
                actionType: "assign_later",
                message: ""
            };
        }

        if (seatAction === SEAT_ACTIONS.RANDOM_NOW) {
            const randomSeatResult = pickRandomSeat(list, safeCandidate, safeOptions);
            if (!randomSeatResult.ok) {
                return randomSeatResult;
            }

            if (!randomSeatResult.seat) {
                return {
                    ok: true,
                    admissionMode,
                    seat: "",
                    seatStatus: SEAT_STATUSES.WAITING,
                    seatAssignedAt: "",
                    seatAssignedBy: "",
                    actionType: "waiting_for_seat",
                    message: randomSeatResult.message
                };
            }

            return {
                ok: true,
                admissionMode,
                seat: randomSeatResult.seat,
                seatStatus: SEAT_STATUSES.RANDOM_ASSIGNED,
                seatAssignedAt: occurredAt,
                seatAssignedBy: actor,
                actionType: "random_assign",
                message: ""
            };
        }

        const validation = validateSeatAssignment(list, safeCandidate, safeOptions);
        if (!validation.ok) {
            return validation;
        }

        return {
            ok: true,
            admissionMode,
            seat: toFiniteNumber(safeCandidate.seat, ""),
            seatStatus: SEAT_STATUSES.MANUAL_ASSIGNED,
            seatAssignedAt: occurredAt,
            seatAssignedBy: actor,
            actionType: baseSeatState.seat ? "change_seat" : "manual_assign",
            message: ""
        };
    }

    function applySeatPlan(student, plan, options) {
        const safeOptions = options && typeof options === "object" ? options : {};
        const base = student && typeof student === "object" ? { ...student } : {};
        const currentSeatState = normalizeStudentSeatFields(base);
        const occurredAt = trimText(safeOptions.occurredAt || plan && plan.seatAssignedAt) || new Date().toISOString();
        const actor = trimText(safeOptions.actor || plan && plan.seatAssignedBy);
        const nextSeat = trimText(plan && plan.seat) === "" ? "" : toFiniteNumber(plan && plan.seat, "");
        const nextMode = normalizeAdmissionMode(plan && plan.admissionMode || base.admissionMode);
        const nextStatus = normalizeSeatStatus(plan && plan.seatStatus, nextMode, nextSeat);
        const nextAssignedAt = nextSeat ? trimText(plan && plan.seatAssignedAt) || occurredAt : "";
        const nextAssignedBy = nextSeat ? trimText(plan && plan.seatAssignedBy) || actor : "";
        const changed = currentSeatState.admissionMode !== nextMode ||
            trimText(currentSeatState.seat) !== trimText(nextSeat) ||
            currentSeatState.seatStatus !== nextStatus;

        let seatHistory = mergeSeatHistory(currentSeatState.seatHistory, []);
        if (changed && safeOptions.skipHistory !== true) {
            seatHistory = mergeSeatHistory(seatHistory, [createSeatHistoryEntry({
                eventId: trimText(plan && plan.eventId),
                studentId: trimText(base.id),
                actionType: trimText(plan && plan.actionType) || "seat_updated",
                oldSeat: currentSeatState.seat,
                newSeat: nextSeat,
                oldSeatStatus: currentSeatState.seatStatus,
                newSeatStatus: nextStatus,
                changedBy: nextAssignedBy || actor,
                occurredAt,
                note: trimText(plan && plan.message)
            })]);
        }

        return {
            ...base,
            admissionMode: nextMode,
            seat: nextSeat,
            seatStatus: nextStatus,
            seatAssignedAt: nextAssignedAt,
            seatAssignedBy: nextAssignedBy,
            seatHistory
        };
    }

    function matchesAdmissionFilter(student, filterValue) {
        const safeStudent = normalizeStudentSeatFields(student);
        const filter = trimText(filterValue).toLowerCase();

        if (!filter || filter === "all") {
            return true;
        }
        if (filter === "regular") {
            return safeStudent.admissionMode === ADMISSION_MODES.REGULAR;
        }
        if (filter === "flexible") {
            return safeStudent.admissionMode === ADMISSION_MODES.FLEXIBLE;
        }
        if (filter === "waiting") {
            return safeStudent.seatStatus === SEAT_STATUSES.WAITING;
        }
        if (filter === "assigned") {
            return hasAssignedSeat(safeStudent);
        }
        return true;
    }

    return {
        ADMISSION_MODES,
        SEAT_STATUSES,
        SEAT_ACTIONS,
        SEAT_STATUS_LABELS,
        normalizeAdmissionMode,
        normalizeSeatAction,
        normalizeSeatStatus,
        normalizeSeatHistory,
        mergeSeatHistory,
        normalizeStudentSeatFields,
        createSeatHistoryEntry,
        buildSeatHistoryEventId,
        getSeatStatusLabel,
        isAssignedSeatStatus,
        hasAssignedSeat,
        validateSeatAssignment,
        pickAvailableSeats,
        pickRandomSeat,
        resolveSeatPlan,
        applySeatPlan,
        matchesAdmissionFilter
    };
});
