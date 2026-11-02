(function() {
    let uploadedFiles = [];

    function initializeMaintenanceSummaryForm(config) {
        const form = document.getElementById(config.formId);
        const dropZone = document.getElementById(config.dropZoneId);
        const fileInput = document.getElementById(config.fileInputId);
        const fileList = document.getElementById(config.fileListId);
        const attachmentsToDeleteInput = document.getElementById(config.attachmentsToDeleteInputId);
        let attachmentsToDelete = [];

        if (!form || !dropZone || !fileInput || !fileList) {
            console.error('One or more form elements not found.');
            return;
        }

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
            handleFiles(files);
        });

        fileInput.addEventListener('change', () => {
            const files = fileInput.files;
            handleFiles(files);
        });

        function handleFiles(files) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                    uploadedFiles.push(file);
                }
            }
            renderFileList();
        }

        function renderFileList() {
            fileList.innerHTML = '';
            uploadedFiles.forEach((file, index) => {
                const listItem = document.createElement('div');
                listItem.className = 'file-item';
                listItem.textContent = file.name;

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'btn btn-sm btn-danger ms-2';
                deleteBtn.textContent = '삭제';
                deleteBtn.onclick = () => {
                    uploadedFiles.splice(index, 1);
                    renderFileList();
                };

                listItem.appendChild(deleteBtn);
                fileList.appendChild(listItem);
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);

            if (config.editor) {
                formData.set('remarks', config.editor.getData());
            }

            // Collect multiple items (품목명 / 제조사 / 버전 / 상세내용)
            const itemNames = form.querySelectorAll('input[name="item_names[]"]');
            const manufacturers = form.querySelectorAll('input[name="manufacturers[]"]');
            const itemVersions = form.querySelectorAll('input[name="item_versions[]"]');
            const itemDetails = form.querySelectorAll('input[name="item_details[]"]');
            const items = [];
            itemNames.forEach((nameInput, index) => {
                const name = nameInput.value.trim();
                const manufacturer = manufacturers[index] ? manufacturers[index].value.trim() : '';
                const version = itemVersions[index] ? itemVersions[index].value.trim() : '';
                const detail = itemDetails[index] ? itemDetails[index].value.trim() : '';
                if (name) {
                    items.push({
                        item_name: name,
                        manufacturer: manufacturer,
                        item_version: version,
                        item_detail: detail
                    });
                }
            });
            formData.append('items', JSON.stringify(items));

            uploadedFiles.forEach(file => {
                formData.append('attachments', file);
            });

            if (attachmentsToDelete.length > 0) {
                formData.append('attachments_to_delete', JSON.stringify(attachmentsToDelete));
            }

            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    // Redirect to the summary list or the updated summary page
                    if (config.isEdit) {
                        window.location.href = `/maintenance/summary/${config.summaryId}`;
                    } else {
                        window.location.href = '/maintenance/summary';
                    }
                } else {
                    const result = await response.json();
                    alert(result.message || 'An error occurred.');
                }
            } catch (error) {
                console.error('Submit error:', error);
                alert('An error occurred while submitting the form.');
            }
        });

        // Handle deletion of existing attachments
        document.querySelectorAll('.delete-attachment-btn').forEach(button => {
            button.addEventListener('click', function() {
                const attachmentId = this.dataset.attachmentId;
                if (confirm('Are you sure you want to delete this attachment?')) {
                    attachmentsToDelete.push(attachmentId);
                    if (attachmentsToDeleteInput) {
                        attachmentsToDeleteInput.value = JSON.stringify(attachmentsToDelete);
                    }
                    this.closest('.attachment-item').remove();
                }
            });
        });
    }

    // Expose the initialize function to the global scope
    window.initializeMaintenanceSummaryForm = initializeMaintenanceSummaryForm;
})();
