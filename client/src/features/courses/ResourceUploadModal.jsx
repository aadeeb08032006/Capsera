import React, { useState } from 'react';
import { uploadResource } from './coursesApi.js';
import UiIcon from '../../components/UiIcon.jsx';

export const RESOURCE_TYPE_OPTIONS = [
  { value: 'DOCUMENT', label: 'Document (PDF, DOCX, TXT)' },
  { value: 'PRESENTATION', label: 'Presentation (PPTX, Slides)' },
  { value: 'VIDEO', label: 'Video (MP4, WebM)' },
  { value: 'LINK', label: 'External Web Link' },
  { value: 'OTHER', label: 'Other File / Dataset' },
];

export default function ResourceUploadModal({ courseId, lessons = [], isOpen, onClose, onSuccess }) {
  const [mode, setMode] = useState('FILE'); // 'FILE' | 'LINK'
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    resourceType: 'DOCUMENT',
    lessonId: '',
    externalUrl: '',
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setError(null);

    // Auto-fill title if empty
    if (file && !formData.title.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setFormData((prev) => ({ ...prev, title: nameWithoutExt }));
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Resource title is required.');
      return;
    }

    if (mode === 'FILE' && !selectedFile) {
      setError('Please select a file to upload.');
      return;
    }

    if (mode === 'LINK' && !formData.externalUrl.trim()) {
      setError('Please enter a valid web URL.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const formPayload = new FormData();
      formPayload.append('title', formData.title.trim());

      if (formData.description.trim()) {
        formPayload.append('description', formData.description.trim());
      }

      formPayload.append('resourceType', formData.resourceType);

      if (formData.lessonId) {
        formPayload.append('lessonId', formData.lessonId);
      }

      if (mode === 'FILE' && selectedFile) {
        formPayload.append('file', selectedFile);
      } else if (mode === 'LINK' && formData.externalUrl.trim()) {
        formPayload.append('externalUrl', formData.externalUrl.trim());
      }

      const created = await uploadResource(courseId, formPayload);

      if (onSuccess) {
        onSuccess(created);
      }
      onClose();
    } catch (err) {
      // Differentiate 413 and 415 error codes
      if (err.status === 413 || err.code === 'FILE_TOO_LARGE') {
        setError('File upload failed: File exceeds the 25 MiB size limit. Please upload a smaller file.');
      } else if (err.status === 415 || err.code === 'DISALLOWED_FILE_TYPE') {
        setError('File upload failed: Disallowed or unsafe file format. Executables and scripts are blocked.');
      } else {
        setError(err.message || 'Failed to upload resource. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="modal-content modal-content-lg">
        <div className="modal-header">
          <h3 id="upload-modal-title">Upload Learning Resource</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close modal"
          >
            <UiIcon name="x" size={16} />
          </button>
        </div>

        {error && (
          <div className="form-alert alert-error" role="alert">
            <span className="alert-icon" aria-hidden="true">
              <UiIcon name="alert-triangle" size={18} />
            </span>
            <div className="alert-body">{error}</div>
          </div>
        )}

        {/* Mode Selector */}
        <div className="upload-mode-toggle" role="tablist" aria-label="Upload source type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'FILE'}
            className={`btn-mode-tab ui-inline ${mode === 'FILE' ? 'active' : ''}`}
            onClick={() => {
              setMode('FILE');
              setFormData((prev) => ({
                ...prev,
                resourceType: prev.resourceType === 'LINK' ? 'DOCUMENT' : prev.resourceType,
              }));
              setError(null);
            }}
          >
            <UiIcon name="folder" size={15} />
            Local File Upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'LINK'}
            className={`btn-mode-tab ui-inline ${mode === 'LINK' ? 'active' : ''}`}
            onClick={() => {
              setMode('LINK');
              setFormData((prev) => ({ ...prev, resourceType: 'LINK' }));
              setError(null);
            }}
          >
            <UiIcon name="link" size={15} />
            External Web Link
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div className="form-group">
            <label htmlFor="res-title" className="form-label">
              Resource Title <span className="required-star">*</span>
            </label>
            <input
              id="res-title"
              name="title"
              type="text"
              className="form-control"
              placeholder="e.g. Course Slide Deck (Week 1)"
              value={formData.title}
              onChange={handleInputChange}
              maxLength={200}
              required
            />
          </div>

          {/* Target Lesson Association */}
          <div className="form-group">
            <label htmlFor="res-lesson-id" className="form-label">
              Associated Lesson
            </label>
            <select
              id="res-lesson-id"
              name="lessonId"
              className="form-control"
              value={formData.lessonId}
              onChange={handleInputChange}
            >
              <option value="">Course-wide / All Lessons</option>
              {lessons.map((lesson, idx) => (
                <option key={lesson.id} value={lesson.id}>
                  Lesson {idx + 1}: {lesson.title}
                </option>
              ))}
            </select>
            <small className="form-hint">
              Optionally assign this resource to a specific lesson or make it general for the entire course.
            </small>
          </div>

          {/* Resource Type */}
          <div className="form-group">
            <label htmlFor="res-type" className="form-label">
              Resource Classification
            </label>
            <select
              id="res-type"
              name="resourceType"
              className="form-control"
              value={formData.resourceType}
              onChange={handleInputChange}
            >
              {RESOURCE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* File Upload Input */}
          {mode === 'FILE' && (
            <div className="form-group">
              <label htmlFor="res-file" className="form-label">
                Select File <span className="required-star">*</span>
              </label>
              <input
                id="res-file"
                type="file"
                className="form-control file-input-control"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.ods,.odp,.zip,.tar,.gz,.png,.jpg,.jpeg,.webp,.mp4,.webm"
                aria-describedby="file-rules-hint"
              />
              <small id="file-rules-hint" className="form-hint">
                Max file size: 25 MiB. Supported: PDF, Office, Text, Images, MP4, Archives. Executable files (.exe, .sh, .bat) are strictly blocked.
              </small>
              {selectedFile && (
                <div className="selected-file-preview">
                  <span>Selected: <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})</span>
                </div>
              )}
            </div>
          )}

          {/* External URL Input */}
          {mode === 'LINK' && (
            <div className="form-group">
              <label htmlFor="res-url" className="form-label">
                External Link URL <span className="required-star">*</span>
              </label>
              <input
                id="res-url"
                name="externalUrl"
                type="url"
                className="form-control"
                placeholder="https://example.com/materials/handout.pdf"
                value={formData.externalUrl}
                onChange={handleInputChange}
                aria-describedby="url-hint"
              />
              <small id="url-hint" className="form-hint">
                Must be an active HTTP or HTTPS link.
              </small>
            </div>
          )}

          {/* Description */}
          <div className="form-group">
            <label htmlFor="res-desc" className="form-label">
              Description / Notes (Optional)
            </label>
            <textarea
              id="res-desc"
              name="description"
              rows={3}
              className="form-control"
              placeholder="Instructions or context for students using this resource..."
              value={formData.description}
              onChange={handleInputChange}
              maxLength={2000}
            />
          </div>

          <div className="modal-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Uploading...' : 'Upload Resource'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}