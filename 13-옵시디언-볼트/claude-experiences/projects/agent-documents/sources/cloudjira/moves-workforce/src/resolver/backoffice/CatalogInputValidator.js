import {LogicalError} from '../../error/LogicalError';
import {ErrorCodes} from '../../utils/errors/ErrorCodes';

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;

export const normalizeCatalogName = (name, requiredCode) => {
    if (typeof name !== 'string' || name.length > MAX_NAME_LENGTH) {
        throw new LogicalError(ErrorCodes.CATALOG_NAME_INVALID, ErrorCodes.CATALOG_NAME_INVALID);
    }

    const normalized = name.trim();
    if (!normalized) {
        throw new LogicalError(requiredCode, requiredCode);
    }
    return normalized;
};

export const validateCatalogDescription = (description) => {
    if (description === undefined || description === null) return '';
    if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) {
        throw new LogicalError(ErrorCodes.CATALOG_DESCRIPTION_INVALID, ErrorCodes.CATALOG_DESCRIPTION_INVALID);
    }
    return description;
};

export const validateSkillCategory = (category) => {
    if (category === undefined || category === null) return '';
    if (typeof category !== 'string' || category.length > MAX_NAME_LENGTH) {
        throw new LogicalError(ErrorCodes.SKILL_CATEGORY_INVALID, ErrorCodes.SKILL_CATEGORY_INVALID);
    }
    return category.trim();
};

export const assertCatalogId = (id, notFoundCode) => {
    if (typeof id !== 'string' || !id.trim()) {
        throw new LogicalError(notFoundCode, notFoundCode);
    }
    return id;
};

export const validateHolidayDate = (holidayDate) => {
    if (holidayDate === undefined || holidayDate === null || holidayDate === '') {
        throw new LogicalError(ErrorCodes.HOLIDAY_DATE_REQUIRED, ErrorCodes.HOLIDAY_DATE_REQUIRED);
    }
    if (typeof holidayDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
        throw new LogicalError(ErrorCodes.HOLIDAY_DATE_INVALID, ErrorCodes.HOLIDAY_DATE_INVALID);
    }
    const [year, month, day] = holidayDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new LogicalError(ErrorCodes.HOLIDAY_DATE_INVALID, ErrorCodes.HOLIDAY_DATE_INVALID);
    }
    return holidayDate;
};

export const validateHolidayWorkRatio = (workRatio) => {
    if (typeof workRatio !== 'number' || !Number.isFinite(workRatio) || workRatio < 0 || workRatio > 1) {
        throw new LogicalError(ErrorCodes.HOLIDAY_WORK_RATIO_INVALID, ErrorCodes.HOLIDAY_WORK_RATIO_INVALID);
    }
    return workRatio;
};
