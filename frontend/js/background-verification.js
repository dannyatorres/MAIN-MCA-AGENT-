// frontend/js/background-verification.js

const BackgroundVerification = {
    currentJobId: null,
    pollInterval: null,

    openCleanerModal() {
        document.getElementById('cleanerModal').classList.add('active');
        document.getElementById('cleanerFileInput').value = '';
        document.getElementById('cleanerProgress').classList.add('hidden');
        document.getElementById('cleanerProgressBar').style.width = '0%';
        document.getElementById('cleanerProgressBar').classList.remove('error');
        document.getElementById('cleanerStatus').textContent = '';
        this.currentJobId = null;
    },

    closeCleanerModal() {
        document.getElementById('cleanerModal').classList.remove('active');
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    },

    async runCleaner() {
        const fileInput = document.getElementById('cleanerFileInput');
        if (!fileInput.files[0]) {
            alert('Please select a CSV file first.');
            return;
        }

        const formData = new FormData();
        formData.append('csvFile', fileInput.files[0]);

        const progressContainer = document.getElementById('cleanerProgress');
        const progressBar = document.getElementById('cleanerProgressBar');
        const status = document.getElementById('cleanerStatus');

        progressContainer.classList.remove('hidden');
        progressBar.style.width = '5%';
        status.textContent = 'Uploading file...';

        try {
            const response = await fetch('/api/cleaner/process-file', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to start job');

            this.currentJobId = data.jobId;
            status.textContent = 'Processing started...';
            this.pollInterval = setInterval(() => this.pollJobStatus(this.currentJobId), 2000);

        } catch (error) {
            status.textContent = 'Error: ' + error.message;
            progressBar.classList.add('error');
        }
    },

    async pollJobStatus(jobId) {
        const progressBar = document.getElementById('cleanerProgressBar');
        const status = document.getElementById('cleanerStatus');

        try {
            const response = await fetch(`/api/cleaner/status/${jobId}`);
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Job not found');

            progressBar.style.width = `${data.progress}%`;
            status.textContent = `Verifying records... ${data.completed}/${data.total} (${data.progress}%)`;

            if (data.status === 'complete') {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
                status.textContent = 'Complete! Downloading...';
                window.location.href = `/api/cleaner/download/${jobId}`;
                setTimeout(() => this.closeCleanerModal(), 2000);
            }

            if (data.status === 'error') {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
                throw new Error(data.error);
            }

        } catch (error) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            status.textContent = 'Error: ' + error.message;
            progressBar.classList.add('error');
        }
    }
};

// Expose global functions for HTML onclick handlers
window.openCleanerModal = () => BackgroundVerification.openCleanerModal();
window.closeCleanerModal = () => BackgroundVerification.closeCleanerModal();
window.runCleaner = () => BackgroundVerification.runCleaner();
