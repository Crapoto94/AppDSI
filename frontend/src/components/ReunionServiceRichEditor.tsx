import { useEffect, useMemo, useRef } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

/**
 * Éditeur WYSIWYG des comptes rendus de réunion : texte riche (titres, gras,
 * listes, liens, tableaux) + images insérées par bouton, par copier-coller ou
 * par glisser-déposer (conservées en data URI dans le HTML de l'item).
 * Les pièces jointes (PDF, etc.) sont gérées séparément par l'item.
 */
export function ReunionServiceRichEditor({
    value, onChange, placeholder, minHeight = 220,
}: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: number;
}) {
    const quillRef = useRef<ReactQuill>(null);

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ header: [2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['blockquote', 'link', 'image'],
                ['clean'],
            ],
            handlers: {
                image: () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                            const editor = quillRef.current?.getEditor();
                            if (!editor) return;
                            const range = editor.getSelection(true);
                            const index = range ? range.index : editor.getLength();
                            editor.insertEmbed(index, 'image', reader.result);
                            editor.setSelection(index + 1, 0);
                        };
                        reader.readAsDataURL(file);
                    };
                    input.click();
                },
            },
        },
        table: true,
    }), []);

    // Collage d'une image « brute » (capture d'écran, image Word) : Quill ne
    // l'insère pas nativement, on l'intercepte et on l'insère en data URI.
    useEffect(() => {
        const quill = quillRef.current;
        const root = quill?.getEditor()?.root as HTMLElement | undefined;
        if (!root) return;
        const handler = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (!file) continue;
                    e.preventDefault();
                    const reader = new FileReader();
                    reader.onload = () => {
                        const editor = quillRef.current?.getEditor();
                        if (!editor) return;
                        const range = editor.getSelection(true);
                        const index = range ? range.index : editor.getLength();
                        editor.insertEmbed(index, 'image', reader.result);
                        editor.setSelection(index + 1, 0);
                    };
                    reader.readAsDataURL(file);
                    break;
                }
            }
        };
        root.addEventListener('paste', handler);
        return () => root.removeEventListener('paste', handler);
    }, []);

    return (
        <div className="rs-rich-editor" style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
            <style>{`
                .rs-rich-editor .ql-toolbar.ql-snow { border: none; border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 4px 8px; }
                .rs-rich-editor .ql-container.ql-snow { border: none; font-family: inherit; font-size: 14px; }
                .rs-rich-editor .ql-editor { min-height: ${minHeight}px; line-height: 1.55; color: #1e293b; }
                .rs-rich-editor .ql-editor.ql-blank::before { font-style: normal; color: #94a3b8; }
                .rs-rich-editor .ql-editor img { max-width: 100%; height: auto; }
            `}</style>
            <ReactQuill
                ref={quillRef}
                theme="snow"
                value={value || ''}
                onChange={(html) => onChange(html === '<p><br></p>' ? '' : html)}
                modules={modules}
                formats={['header', 'bold', 'italic', 'underline', 'strike', 'list', 'blockquote', 'link', 'image', 'table']}
                placeholder={placeholder}
            />
        </div>
    );
}

/** Affichage en lecture seule du contenu HTML d'un item (images incluses). */
export function ReunionRichContent({ html, className }: { html: string; className?: string }) {
    return (
        <div className={`rs-rich-content ${className || ''}`}>
            <style>{`
                .rs-rich-content { line-height: 1.6; color: #334155; overflow-wrap: anywhere; }
                .rs-rich-content p { margin: 0 0 .7em; }
                .rs-rich-content ul, .rs-rich-content ol { margin: 0 0 .7em; padding-left: 1.4em; }
                .rs-rich-content ul { list-style: disc; }
                .rs-rich-content ol { list-style: decimal; }
                .rs-rich-content h1, .rs-rich-content h2, .rs-rich-content h3 { color: #111827; line-height: 1.3; margin: 1em 0 .5em; }
                .rs-rich-content h2 { font-size: 1.25em; }
                .rs-rich-content h3 { font-size: 1.1em; }
                .rs-rich-content img { max-width: 100%; height: auto; border-radius: 6px; margin: .4em 0; }
                .rs-rich-content table { border-collapse: collapse; width: 100%; margin: 0 0 1em; font-size: .95em; }
                .rs-rich-content th, .rs-rich-content td { border: 1px solid #e2e8f0; padding: .35em .6em; text-align: left; }
                .rs-rich-content th { background: #f8fafc; }
                .rs-rich-content a { color: #0078a4; text-decoration: underline; }
                .rs-rich-content blockquote { border-left: 3px solid #cbd5e1; margin: 0 0 1em; padding-left: 1em; color: #64748b; }
                .rs-rich-content > :last-child { margin-bottom: 0; }
            `}</style>
            <div dangerouslySetInnerHTML={{ __html: html || '' }} />
        </div>
    );
}
