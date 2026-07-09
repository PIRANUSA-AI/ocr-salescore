export async function openEmailClient(
    client: 'gmail' | 'outlook',
    subject: string,
    bodyContent: string,
    recipients: string[],
    onSuccess: (msg: string) => void,
    onError: (msg: string) => void
) {
    if (!subject.trim()) {
        onError('Harap isi subjek email.');
        return;
    }
    if (!bodyContent.trim()) {
        onError('Isi email kosong. Harap buat atau tulis isi email.');
        return;
    }

    try {
        await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': new Blob([bodyContent], { type: 'text/html' }) })
        ]);
        onSuccess('Konten email disalin ke clipboard.');

        const recipientString = recipients.join(',');
        const encodedSubject = encodeURIComponent(subject);
        let mailUrl = '';

        const isMultiple = recipients.length > 1;

        if (client === 'gmail') {
            const params = new URLSearchParams();
            params.append('view', 'cm');
            params.append('fs', '1');
            params.append('su', subject);
            if (isMultiple) {
                params.append('bcc', recipientString);
            } else {
                params.append('to', recipientString);
            }
            mailUrl = `https://mail.google.com/mail/?${params.toString()}`;
        } else {
            const params = new URLSearchParams();
            params.append('subject', subject);
            if (isMultiple) {
                params.append('bcc', recipientString);
            } else {
                params.append('to', recipientString);
            }
            mailUrl = `mailto:?${params.toString()}`;
        }

        window.open(mailUrl, '_blank');
        return true; // Indicate success
    } catch (err) {
        console.error('Failed to copy/open:', err);
        onError('Gagal menyalin konten.');
        return false;
    }
}
