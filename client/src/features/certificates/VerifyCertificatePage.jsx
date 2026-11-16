import React, { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { verifyCertificate } from './certificatesApi.js';
import './certificates.css';

const CERTIFICATE_CODE_REGEX = /^[A-Za-z0-9-]+$/;

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/**
 * Public Certificate Verification page (`/certificates/verify` and
 * `/certificates/verify/:certificateCode`). Displays only minimal non-sensitive
 * verification details returned by the backend.
 */
export default function VerifyCertificatePage() {
  const { certificateCode: routeParamCode = '' } = useParams();
  const navigate = useNavigate();

  const headingId = useId();
  const codeInputId = useId();

  const routeCode = routeParamCode.trim();
  const [codeInput, setCodeInput] = useState(routeCode);
  const [validationError, setValidationError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  const [certificate, setCertificate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCodeInput(routeCode);
    setValidationError(null);
  }, [routeCode]);

  useEffect(() => {
    if (!routeCode) {
      setCertificate(null);
      setIsLoading(false);
      setNotFound(false);
      setError(null);
      return undefined;
    }

    if (routeCode.length > 64 || !CERTIFICATE_CODE_REGEX.test(routeCode)) {
      setCertificate(null);
      setIsLoading(false);
      setNotFound(false);
      setError('Certificate code must contain only letters, numbers, and hyphens (max 64 characters).');
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setNotFound(false);
    setError(null);
    setCertificate(null);

    verifyCertificate(routeCode, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        setCertificate(result);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setIsLoading(false);
        if (err.code === 'CERTIFICATE_NOT_FOUND' || err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(err.message || 'Unable to verify certificate right now.');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [routeCode, retryTick]);

  function handleSubmit(event) {
    event.preventDefault();
    if (isLoading) return;

    const trimmed = codeInput.trim();
    if (!trimmed) {
      setValidationError('Enter a certificate code to verify.');
      return;
    }
    if (trimmed.length > 64 || !CERTIFICATE_CODE_REGEX.test(trimmed)) {
      setValidationError(
        'Certificate code must contain only letters, numbers, and hyphens (max 64 characters).',
      );
      return;
    }

    setValidationError(null);
    if (trimmed === routeCode) {
      setRetryTick((tick) => tick + 1);
      return;
    }

    navigate(`/certificates/verify/${encodeURIComponent(trimmed)}`);
  }

  return (
    <main className="certificates-page">
      <nav aria-label="Breadcrumb">
        <Link to="/" className="certificates-back-link">
          &larr; Back to CAPSERA Home
        </Link>
      </nav>

      <header className="certificates-page-header">
        <h1 id={headingId}>Verify Certificate</h1>
        <p className="certificates-subtitle">
          Enter a CAPSERA certificate verification code to confirm authenticity and validity status.
        </p>
      </header>

      <section className="certificates-card" aria-labelledby={headingId}>
        <form className="certificates-form" onSubmit={handleSubmit} noValidate>
          <div className="certificates-field">
            <label className="certificates-label" htmlFor={codeInputId}>
              Certificate Code
            </label>
            <div className="certificates-search-row">
              <input
                id={codeInputId}
                type="text"
                maxLength={64}
                className={`certificates-input ${
                  validationError ? 'certificates-input-error' : ''
                }`.trim()}
                placeholder="e.g. CAP-A1B2-C3D4-E5F6"
                value={codeInput}
                onChange={(event) => {
                  setCodeInput(event.target.value);
                  setValidationError(null);
                }}
                disabled={isLoading}
                required
              />
              <button
                type="submit"
                className="certificates-btn certificates-btn-primary"
                disabled={isLoading}
              >
                {isLoading ? 'Verifying...' : 'Verify Certificate'}
              </button>
            </div>
            {validationError && (
              <p className="certificates-field-error" role="alert">
                {validationError}
              </p>
            )}
          </div>
        </form>

        {isLoading && (
          <p className="certificates-status-text" role="status" aria-live="polite">
            Checking certificate record...
          </p>
        )}

        {!isLoading && error && (
          <div className="certificates-banner certificates-banner-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="certificates-btn certificates-btn-secondary"
              onClick={() => setRetryTick((tick) => tick + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && notFound && (
          <div className="certificates-banner certificates-banner-warning" role="status">
            <span>
              No certificate record matches code &ldquo;{routeCode}&rdquo;. Check the code and try
              again.
            </span>
          </div>
        )}

        {!isLoading && !error && !notFound && certificate && (
          <article className="certificate-verify-result" aria-label="Verification result">
            <div className="certificate-card-top">
              <div>
                <p className="certificate-code-label">Certificate Code</p>
                <p className="certificate-code-value">{certificate.certificateCode}</p>
              </div>
              <span
                className={`certificate-badge ${
                  certificate.isValid ? 'certificate-badge-valid' : 'certificate-badge-revoked'
                }`}
              >
                {certificate.isValid ? 'Status: VALID' : 'Status: REVOKED'}
              </span>
            </div>

            <dl className="certificate-details-grid">
              <div>
                <dt>Trainee Name</dt>
                <dd>{certificate.traineeName}</dd>
              </div>
              <div>
                <dt>Course Title</dt>
                <dd>{certificate.courseTitle}</dd>
              </div>
              <div>
                <dt>Issued Date</dt>
                <dd>{formatDate(certificate.issuedAt)}</dd>
              </div>
              {!certificate.isValid && certificate.revokedAt && (
                <div>
                  <dt>Revoked Date</dt>
                  <dd>{formatDate(certificate.revokedAt)}</dd>
                </div>
              )}
            </dl>
          </article>
        )}
      </section>
    </main>
  );
}

