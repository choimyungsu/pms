
    let uploadedFiles = [];

function initializeKnowledgeForm(formId, dropZoneId, fileInputId, fileListId, attachmentsToDeleteInputId) {
    const form = document.getElementById(formId);
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);
    const fileList = document.getElementById(fileListId);
    const attachmentsToDeleteInput = document.getElementById(attachmentsToDeleteInputId);
    let attachmentsToDelete = [];

    if (dropZone && fileInput && fileList) {
        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-primary');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-primary');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-primary');
            const files = e.dataTransfer.files;
            updateFileList(files);
        });

        fileInput.addEventListener('change', () => {
            const files = fileInput.files;
            updateFileList(files);
        });
    }

    function updateFileList(files) {
        fileList.innerHTML = '';
        uploadedFiles = []; // Clear previous files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            uploadedFiles.push(file);
            const listItem = document.createElement('div');
            listItem.textContent = file.name;
            fileList.appendChild(listItem);
        }
        // This line is problematic as fileInput.files is read-only
        // fileInput.files = files; 
    }

    // Handle attachment deletion for edit page
    document.querySelectorAll('.delete-attachment-btn').forEach(button => {
        button.addEventListener('click', function() {
            const attachmentId = this.dataset.attachmentId;
            if (confirm('이 첨부파일을 삭제하시겠까?')) {
                attachmentsToDelete.push(attachmentId);
                if (attachmentsToDeleteInput) {
                    attachmentsToDeleteInput.value = JSON.stringify(attachmentsToDelete);
                }
                this.closest('.attachment-item').remove();
            }
        });
    });

    return {
        getUploadedFiles: () => uploadedFiles,
        getAttachmentsToDelete: () => attachmentsToDelete
    };
}

async function deleteKnowledgeItem(itemId) {
    if (!confirm('정말로 이 지식 자료를 삭제하시겠습니까?')) {
        return;
    }

    try {
        const response = await fetch(`/knowledge/api/items/${itemId}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (response.ok) {
            window.location.href = '/knowledge';
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('An error occurred while deleting the knowledge item.');
    }
}
    });
