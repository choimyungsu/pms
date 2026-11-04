/*!
 * 지식관리 첨부파일 공통 헬퍼
 * - 클릭 선택 / 드래그&드롭 / 클립보드 붙여넣기(Ctrl+V) 지원
 * - 파일형식별 아이콘, 용량 표시, 붙여넣기 파일 이름 자동 생성
 */
(function (window, document) {
    'use strict';

    // 서버 multer 설정(upload.array('attachments', 10))과 동일하게 맞춘다.
    var MAX_FILES = 10;

    var EXT_MAP = {
        excel: ['xls', 'xlsx', 'csv'],
        word: ['doc', 'docx', 'hwp', 'hwpx', 'odt', 'txt', 'md', 'rtf'],
        powerpoint: ['ppt', 'pptx', 'odp'],
        pdf: ['pdf'],
        archive: ['zip', '7z', 'rar', 'tar', 'gz'],
        image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'],
        video: ['mp4', 'avi', 'mkv', 'mov', 'wmv'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'm4a']
    };

    var ICON_COLOR = {
        'fa-file-excel': '#2b7a45',
        'fa-file-word': '#2f6bbd',
        'fa-file-powerpoint': '#c1571a',
        'fa-file-pdf': '#b93a3a',
        'fa-file-archive': '#96631a',
        'fa-file-image': '#21717f',
        'fa-file-video': '#6a45c2',
        'fa-file-audio': '#8a4b9e',
        'fa-file': '#7a93b5'
    };

    function extOf(name) {
        var parts = String(name || '').split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    function fileIcon(name) {
        var ext = extOf(name);
        for (var key in EXT_MAP) {
            if (Object.prototype.hasOwnProperty.call(EXT_MAP, key) && EXT_MAP[key].indexOf(ext) !== -1) {
                return 'fa-file-' + key;
            }
        }
        return 'fa-file';
    }

    function iconColor(icon) {
        return ICON_COLOR[icon] || ICON_COLOR['fa-file'];
    }

    function formatSize(bytes) {
        var n = Number(bytes) || 0;
        if (n <= 0) return '';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
        return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function pad2(n) {
        return (n < 10 ? '0' : '') + n;
    }

    function stamp() {
        var d = new Date();
        return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
            '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    }

    /**
     * 클립보드에서 온 이미지는 파일 이름이 image.png 등으로 고정되어 있어
     * 여러 장을 붙여넣으면 서로 덮어써진다. 고유한 이름을 부여한다.
     */
    function renameClipboardFile(file, seq) {
        var rawName = String(file.name || '');
        var generic = !rawName || /^image\.(png|jpe?g|gif|bmp|webp)$/i.test(rawName);
        if (!generic) return file;

        var ext = extOf(rawName) || (String(file.type || '').split('/')[1] || 'png');
        var newName = '붙여넣기_' + stamp() + (seq ? '_' + seq : '') + '.' + ext;
        try {
            return new File([file], newName, { type: file.type, lastModified: Date.now() });
        } catch (e) {
            // File 생성자가 없는 구형 브라우저는 원본을 그대로 사용한다.
            return file;
        }
    }

    function filesFromClipboard(event) {
        var cd = event.clipboardData || window.clipboardData;
        if (!cd) return [];

        // 1) 탐색기에서 복사한 실제 파일 (Chrome/Edge/Firefox 지원)
        if (cd.files && cd.files.length) {
            var direct = [];
            for (var i = 0; i < cd.files.length; i++) direct.push(cd.files[i]);
            return direct;
        }

        // 2) 스크린샷 등 clipboardData.items 기반
        var out = [];
        var items = cd.items || [];
        for (var j = 0; j < items.length; j++) {
            var it = items[j];
            if (it.kind === 'file') {
                var f = it.getAsFile ? it.getAsFile() : null;
                if (f) out.push(f);
            }
        }
        return out;
    }

    /**
     * Ctrl+V 붙여넣기로 파일이 들어오면 onFiles 콜백을 호출한다.
     * - 파일이 없는 일반 텍스트 붙여넣기는 가로채지 않는다.
     * - options.onFiles(files, source) : source 는 'paste'
     */
    function bindPaste(onFiles, options) {
        options = options || {};
        document.addEventListener('paste', function (event) {
            // 이 화면에서 붙여넣기를 처리할 상태가 아니면 아무것도 하지 않는다.
            if (typeof options.shouldHandle === 'function' && !options.shouldHandle()) {
                return;
            }

            // 파일이 아닌 일반 텍스트/HTML 붙여넣기는 기본 동작을 유지한다.
            var files = filesFromClipboard(event);
            if (!files.length) return;

            event.preventDefault();

            var seq = 0;
            var renamed = files.map(function (f) {
                seq += 1;
                return renameClipboardFile(f, files.length > 1 ? seq : 0);
            });

            if (typeof options.onPasteStart === 'function') {
                options.onPasteStart(renamed.length);
            }
            onFiles(renamed, 'paste');
        });
    }

    window.KnowledgeAttach = {
        MAX_FILES: MAX_FILES,
        fileIcon: fileIcon,
        iconColor: iconColor,
        formatSize: formatSize,
        renameClipboardFile: renameClipboardFile,
        filesFromClipboard: filesFromClipboard,
        bindPaste: bindPaste
    };
})(window, document);
