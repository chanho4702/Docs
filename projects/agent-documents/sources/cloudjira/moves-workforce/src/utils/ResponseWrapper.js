import {assertLicenseAllowed} from './license/LicenseGuard';

export const responseWrapper = (fn) => async (req) => {
    try {
        // resolver·trigger·queue가 동일한 4-state 판정을 공유한다. production에서
        // context/API 모두 판정할 수 없으면 LICENSE_STATUS_UNAVAILABLE로 fail-closed한다.
        await assertLicenseAllowed(req?.context ?? {});

        const result = await fn(req);

        return {
            success: true,
            ...result,
        };
    } catch (e) {
        return {
            success: false,
            error: {
                name: e.name, // 발생한 Error name
                code: e.code || 'UNKNOWN_ERROR', // 발생한 error code
                message: e.message || 'UNKNOWN_ERROR', // 발생한 error message
                cause: e?.cause || '', // 상위 발생한 Error에 대한 정보
            },
        };
    }
};
