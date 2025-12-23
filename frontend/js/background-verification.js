// frontend/js/background-verification.js

let currentJobId = null;
let pollInterval = null;

function openCleanerModal() {
    document.getElementById('cleanerModal').classList.add('active');
    document.getElementById('cleanerFileInput').value = '';
    document.getElementById('cleanerProgress').classList.add('hidden');
    document.getElementById('cleanerProgressBar').style.width = '0%';
    document.getElementById('cleanerProgressBar').classList.remove('error');
    document.getElementById('cleanerStatus').textContent = '';
    currentJobId = null;
}

function closeCleanerModal() {
    document.getElementById('cleanerModal').classList.remove('active');
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

async function runCleaner() {
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

        currentJobId = data.jobId;
        status.textContent = 'Processing started...';
        pollInterval = setInterval(() => pollJobStatus(currentJobId), 2000);

    } catch (error) {
        status.textContent = 'Error: ' + error.message;
        progressBar.classList.add('error');
    }
}

async function pollJobStatus(jobId) {
    const progressBar = document.getElementById('cleanerProgressBar');
    const status = document.getElementById('cleanerStatus');

    try {
        const response = await fetch(`/api/cleaner/status/${jobId}`);
        const data = await response.json();

        if (!data.success) throw new Error(data.error || 'Job not found');

        progressBar.style.width = `${data.progress}%`;
        status.textContent = `Verifying records... ${data.completed}/${data.total} (${data.progress}%)`;

        if (data.status === 'complete') {
            clearInterval(pollInterval);
            pollInterval = null;
            status.textContent = 'Complete! Downloading...';
            window.location.href = `/api/cleaner/download/${jobId}`;
            setTimeout(() => closeCleanerModal(), 2000);
        }

        if (data.status === 'error') {
            clearInterval(pollInterval);
            pollInterval = null;
            throw new Error(data.error);
        }

    } catch (error) {
        clearInterval(pollInterval);
        pollInterval = null;
        status.textContent = 'Error: ' + error.message;
        progressBar.classList.add('error');
    }
}
