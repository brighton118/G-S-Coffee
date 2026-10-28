/**
 * Brevo (formerly Sendinblue) Transactional Email Service
 * Official API: POST https://api.brevo.com/v3/smtp/email
 * Documentation: https://developers.brevo.com/docs/send-a-transactional-email
 */

export interface BrevoRecipient {
    email: string;
    name?: string;
}

export interface BrevoAttachment {
    name: string;
    content: string; // Base64 encoded string
}

export interface BrevoEmailRequest {
    to: (BrevoRecipient | string)[] | BrevoRecipient | string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    sender?: {
        name: string;
        email: string;
    };
    attachment?: BrevoAttachment[];
    tags?: string[];
}

export interface BrevoDispatchResult {
    success: boolean;
    messageId?: string;
    error?: string;
    code?: string;
}

export interface BrevoConfigOptions {
    apiKey?: string;
    senderEmail?: string;
    senderName?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class BrevoService {
    private apiKey: string;
    private senderEmail: string;
    private senderName: string;

    constructor(options?: BrevoConfigOptions) {
        this.apiKey = options?.apiKey ?? process.env.BREVO_API_KEY ?? '';
        this.senderEmail = options?.senderEmail ?? process.env.BREVO_SENDER_EMAIL ?? 'notifications@gsfarm.farm';
        this.senderName = options?.senderName ?? process.env.BREVO_SENDER_NAME ?? 'G&S Coffee Farm Management System';
    }

    public isConfigured(): boolean {
        return Boolean(this.apiKey && this.apiKey.trim().length > 10);
    }

    public getStatus() {
        return {
            configured: this.isConfigured(),
            senderEmail: this.senderEmail,
            senderName: this.senderName
        };
    }

    public getSenderInfo() {
        return {
            email: this.senderEmail,
            name: this.senderName,
            isConfigured: this.isConfigured()
        };
    }

    public async sendEmail(request: BrevoEmailRequest): Promise<BrevoDispatchResult> {
        if (!this.isConfigured()) {
            return {
                success: false,
                code: 'MISSING_API_KEY',
                error: 'Brevo API key is not configured in environment variables (BREVO_API_KEY).'
            };
        }

        // Normalize recipients
        let rawRecipients: (BrevoRecipient | string)[] = [];
        if (Array.isArray(request.to)) {
            rawRecipients = request.to;
        } else if (typeof request.to === 'string') {
            rawRecipients = [request.to];
        } else if (request.to && typeof request.to === 'object') {
            rawRecipients = [request.to];
        }

        if (rawRecipients.length === 0) {
            return {
                success: false,
                code: 'INVALID_RECIPIENT',
                error: 'At least one recipient email address is required.'
            };
        }

        const validRecipients: BrevoRecipient[] = [];
        for (const r of rawRecipients) {
            const emailStr = typeof r === 'string' ? r : (r?.email || '');
            const nameStr = typeof r === 'object' && r ? r.name : undefined;
            const cleanEmail = emailStr.trim().toLowerCase();
            if (EMAIL_REGEX.test(cleanEmail)) {
                validRecipients.push({
                    email: cleanEmail,
                    name: nameStr ? nameStr.trim() : undefined
                });
            }
        }

        if (validRecipients.length === 0) {
            return {
                success: false,
                code: 'INVALID_RECIPIENT',
                error: 'All provided recipient email addresses are invalid.'
            };
        }

        // Validate Subject and Content
        if (!request.subject || !request.subject.trim()) {
            return {
                success: false,
                code: 'INVALID_SUBJECT',
                error: 'Email subject line is required.'
            };
        }

        if (!request.htmlContent || !request.htmlContent.trim()) {
            return {
                success: false,
                code: 'INVALID_CONTENT',
                error: 'HTML content body is required.'
            };
        }

        const sender = {
            name: (request.sender?.name || this.senderName).trim(),
            email: (request.sender?.email || this.senderEmail).trim()
        };

        const payload: Record<string, any> = {
            sender,
            to: validRecipients,
            subject: request.subject.trim(),
            htmlContent: request.htmlContent
        };

        if (request.textContent && request.textContent.trim()) {
            payload.textContent = request.textContent.trim();
        }

        if (request.attachment && Array.isArray(request.attachment) && request.attachment.length > 0) {
            payload.attachment = request.attachment;
        }

        if (request.tags && Array.isArray(request.tags)) {
            payload.tags = request.tags;
        }

        // Execute HTTPS request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': this.apiKey.trim(),
                    'content-type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const responseData: any = await response.json().catch(() => ({}));

            if (!response.ok) {
                const status = response.status;
                const errMessage = responseData.message || responseData.error || response.statusText;
                console.warn(`[Brevo] API Error (${status}): ${errMessage}`);

                if (status === 401) {
                    return {
                        success: false,
                        code: 'UNAUTHORIZED',
                        error: 'Brevo authentication failed. Please verify your BREVO_API_KEY.'
                    };
                }
                if (status === 402) {
                    return {
                        success: false,
                        code: 'QUOTA_EXCEEDED',
                        error: 'Brevo transactional email credits exhausted.'
                    };
                }
                if (status === 429) {
                    return {
                        success: false,
                        code: 'RATE_LIMITED',
                        error: 'Brevo rate limit exceeded. Please retry in a few moments.'
                    };
                }

                return {
                    success: false,
                    code: responseData.code || `HTTP_${status}`,
                    error: `Brevo API error: ${errMessage}`
                };
            }

            console.log(`[Brevo] Email accepted by API. MessageId: ${responseData.messageId} to ${validRecipients.map(r => r.email).join(', ')}`);

            return {
                success: true,
                messageId: responseData.messageId
            };
        } catch (err: any) {
            clearTimeout(timeoutId);
            const isAbort = err?.name === 'AbortError';
            console.error('[Brevo] Network or fetch error:', err?.message || err);
            return {
                success: false,
                code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
                error: isAbort ? 'Brevo request timed out after 15 seconds.' : (err?.message || 'Network error reaching Brevo API.')
            };
        }
    }
}
