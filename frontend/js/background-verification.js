// frontend/js/background-verification.js

function openCleanerModal() {
    document.getElementById('cleanerModal').classList.add('active');
    document.getElementById('cleanerFileInput').value = '';
    document.getElementById('cleanerProgress').classList.add('hidden');
    document.getElementById('cleanerProgressBar').classList.remove('error');
}

function closeCleanerModal() {
    document.getElementById('cleanerModal').classList.remove('active');
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
    progressBar.style.width = '50%';
    status.textContent = 'Verifying records...';

    try {
        const response = await fetch('/api/cleaner/process-file', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Processing failed');

        progressBar.style.width = '100%';
        status.textContent = 'Complete! Downloading...';

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'VERIFIED_' + fileInput.files[0].name;
        a.click();

        setTimeout(() => closeCleanerModal(), 1500);

    } catch (error) {
        status.textContent = 'Error: ' + error.message;
        progressBar.classList.add('error');
    }
}
