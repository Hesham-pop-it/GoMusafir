/**
 * Shared Data Visibility Helper for GoMusafir
 * Standardizes visibility rules across the entire app for:
 * - name (First Name)
 * - lastname (Last Name)
 * - email (Email Address)
 * - phone (Phone Number)
 * - photo (Profile Photo)
 * - location (Live Location)
 */

/**
 * Determines if a given user is a staff member (Admin, Co-Host, Manager, or Trip Organizer)
 */
export const isStaffMember = (uid, staffData = {}, organizerId = null, role = null) => {
    if (!uid) return false;
    
    // Privileged visibility requires a current role in this organization's staff
    // table. Route flags, organizer IDs and another organization's token do not count.
    const entry = staffData?.[uid];
    const staffRole = typeof entry === 'string' ? entry : entry?.role;
    const normalized = String(staffRole || '').toLowerCase().replace(/[^a-z]/g, '');
    if (['admin', 'manager', 'cohost'].includes(normalized)) return true;

    return false;
};

/**
 * Normalizes visibility setting string
 */
export const normalizeVisibilityOption = (val) => {
    if (!val) return 'show to organizer';
    const s = String(val).trim().toLowerCase().replace(/[^a-z]/g, '');
    if (['showtoeveryone', 'everyone', 'all'].includes(s)) {
        return 'show to everyone';
    }
    if (s.includes('notshow') || s.includes('dontshow') || s.includes('hide') || s.includes('none') || s.includes('hidden')) {
        return 'do not show';
    }
    if (s.includes('custom')) {
        return 'custom choice';
    }
    if (s.includes('organizer')) {
        return 'show to organizer';
    }
    return 'show to organizer';
};

/**
 * Resolves the raw setting for a field from a config object, supporting common aliases and casing
 */
export const getFieldSetting = (config, field) => {
    if (!config || typeof config !== 'object') return null;
    
    // Direct key lookup
    if (config[field] !== undefined && config[field] !== null) return config[field];

    const targetKey = String(field).toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check all keys in config with normalized comparison
    for (const key of Object.keys(config)) {
        const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normKey === targetKey) {
            return config[key];
        }
    }

    // Alias matching for first name
    if (['name', 'firstname', 'first', 'fname'].includes(targetKey)) {
        for (const key of Object.keys(config)) {
            const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['name', 'firstname', 'first', 'fname'].includes(normKey)) {
                return config[key];
            }
        }
    }

    // Alias matching for last name
    if (['lastname', 'last', 'surname', 'lname'].includes(targetKey)) {
        for (const key of Object.keys(config)) {
            const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['lastname', 'last', 'surname', 'lname'].includes(normKey)) {
                return config[key];
            }
        }
    }

    // Alias matching for email
    if (['email', 'emailaddress', 'mail'].includes(targetKey)) {
        for (const key of Object.keys(config)) {
            const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['email', 'emailaddress', 'mail'].includes(normKey)) {
                return config[key];
            }
        }
    }

    // Alias matching for phone
    if (['phone', 'phonenumber', 'mobile', 'cell'].includes(targetKey)) {
        for (const key of Object.keys(config)) {
            const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['phone', 'phonenumber', 'mobile', 'cell'].includes(normKey)) {
                return config[key];
            }
        }
    }

    // Alias matching for photo
    if (['photo', 'profilephoto', 'image', 'avatar', 'photourl'].includes(targetKey)) {
        for (const key of Object.keys(config)) {
            const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['photo', 'profilephoto', 'image', 'avatar', 'photourl'].includes(normKey)) {
                return config[key];
            }
        }
    }

    // Alias matching for location
    if (['location', 'livelocation', 'gps'].includes(targetKey)) {
        for (const key of Object.keys(config)) {
            const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['location', 'livelocation', 'gps'].includes(normKey)) {
                return config[key];
            }
        }
    }

    return null;
};

/**
 * Evaluates whether a specific PII field of a target user should be visible to a viewer.
 */
export const checkPIIVisibility = ({
    field,
    targetUid,
    viewerUid,
    isViewerStaff = false,
    isTargetStaff = false,
    globalConfig = {},
    personalVisibility = {}
}) => {
    const isCurrentUser = Boolean(targetUid && viewerUid && String(targetUid) === String(viewerUid));

    // 1. Resolve Global Admin / Trip-level Configuration
    const rawGlobal = getFieldSetting(globalConfig, field);
    // If not specified at global level, default to 'show to everyone' for location, 'show to organizer' for sensitive PII
    const defaultGlobal = 'show to organizer';
    const globalSetting = normalizeVisibilityOption(rawGlobal || defaultGlobal);

    // If Global is explicitly "do not show", it is hidden for EVERYONE (except current user viewing their own data)
    if (globalSetting === 'do not show') {
        return false;
    }

    // 2. Custom Choice: Participant's personal configuration
    if (globalSetting === 'custom choice') {
        const rawPersonal = getFieldSetting(personalVisibility, field) || 'Show to organizer';
        const personalSetting = normalizeVisibilityOption(rawPersonal);

        if (personalSetting === 'do not show') {
            return false;
        }
        if (personalSetting === 'show to everyone') {
            return true;
        }
        if (personalSetting === 'show to organizer') {
            return Boolean(isViewerStaff || isCurrentUser);
        }
    }

    // 3. If Global is "show to everyone", visible to ALL participants and staff
    if (globalSetting === 'show to everyone') {
        return true;
    }

    // 4. If Global is "show to organizer"
    if (globalSetting === 'show to organizer') {
        if (isViewerStaff) return true;
        if (isCurrentUser) return true;

        return false;
    }

    // Fallback
    if (isViewerStaff) return true;
    if (isCurrentUser) return true;

    return false;
};

/**
 * Resolves the display name for a participant taking into account firstName ('name') and lastName ('lastname') visibility.
 */
export const getParticipantDisplayName = ({
    profile = {},
    fullName = '',
    targetUid,
    viewerUid,
    isViewerStaff = false,
    isTargetStaff = false,
    globalConfig = {},
    personalVisibility = {}
}) => {
    const isCurrentUser = Boolean(targetUid && viewerUid && String(targetUid) === String(viewerUid));

    const canSeeFirstName = checkPIIVisibility({
        field: 'name',
        targetUid,
        viewerUid,
        isViewerStaff,
        isTargetStaff,
        globalConfig,
        personalVisibility
    });

    const canSeeLastName = checkPIIVisibility({
        field: 'lastname',
        targetUid,
        viewerUid,
        isViewerStaff,
        isTargetStaff,
        globalConfig,
        personalVisibility
    });

    let rawFirst = profile.firstName || profile.first_name || '';
    let rawLast = profile.lastName || profile.last_name || '';
    if (!rawFirst && !rawLast && fullName) {
        const parts = String(fullName).trim().split(/\s+/);
        rawFirst = parts[0] || '';
        rawLast = parts.slice(1).join(' ') || '';
    }

    const first = canSeeFirstName ? rawFirst : '';
    const last = canSeeLastName ? rawLast : '';

    const combinedName = `${first} ${last}`.trim();
    if (combinedName) {
        return combinedName;
    }

    if (isCurrentUser) {
        return 'You';
    }

    if (isTargetStaff) {
        return 'Staff Member';
    }

    return 'Participant';
};

/**
 * Resolves the display photo for a participant taking into account photo visibility.
 */
export const getParticipantDisplayPhoto = ({
    profile = {},
    rawPhoto = null,
    displayName = 'U',
    targetUid,
    viewerUid,
    isViewerStaff = false,
    isTargetStaff = false,
    globalConfig = {},
    personalVisibility = {}
}) => {
    const canSeePhoto = checkPIIVisibility({
        field: 'photo',
        targetUid,
        viewerUid,
        isViewerStaff,
        isTargetStaff,
        globalConfig,
        personalVisibility
    });

    const candidatePhoto = profile?.photoURL || profile?.photo_url || profile?.photo || profile?.profile_photo || profile?.image || profile?.avatar || rawPhoto;

    if (canSeePhoto && candidatePhoto && typeof candidatePhoto === 'string' && candidatePhoto.trim() !== '' && !candidatePhoto.includes('ui-avatars.com')) {
        return candidatePhoto;
    }

    const firstLetter = (displayName && displayName !== 'You' && displayName !== 'Staff Member' && displayName !== 'Participant' ? displayName[0] : 'U') || 'U';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(firstLetter)}&background=B99A4A&color=fff`;
};


