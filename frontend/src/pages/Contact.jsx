import React, { useState } from 'react';
import {
  Mail,
  MessageCircle,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MapPin,
  Clock,
  ArrowRight
} from 'lucide-react';
import { submitContact } from '../services/api';
import '../styles/Contact.css';

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation
    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage('Please enter your name (at least 2 characters).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!message.trim() || message.trim().length < 10) {
      setErrorMessage('Please enter a message with at least 10 characters.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await submitContact({
        name: name.trim(),
        email: email.trim(),
        message: message.trim()
      });

      if (res && res.success) {
        setSuccessMessage(res.message || 'Message submitted successfully.');
        setName('');
        setEmail('');
        setMessage('');
      } else {
        throw new Error(res?.error?.message || 'Submission failed.');
      }
    } catch (err) {
      console.error('Contact submission error:', err);
      setErrorMessage(err.message || 'Unable to submit your message. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="contact-page">
      <section className="contact-hero">
        <div className="contact-container">
          <div className="contact-hero-grid">
            {/* Left Column: Information */}
            <div className="contact-intro">
              <div className="contact-eyebrow">
                <span className="eyebrow-dot" />
                <span>GET IN TOUCH</span>
              </div>

              <h1 className="contact-title">
                Let's build
                <span>smarter travel routes.</span>
              </h1>

              <p className="contact-desc">
                Have questions about our multi-objective Pareto solver, sustainable transit datasets, or want to partner with ReRoute? Send us a note.
              </p>

              <div className="contact-info-list">
                <div className="contact-info-item">
                  <div className="contact-info-icon">
                    <Mail size={18} />
                  </div>
                  <div>
                    <span className="info-meta">Direct Inquiries</span>
                    <strong>contact@reroute.travel</strong>
                  </div>
                </div>

                <div className="contact-info-item">
                  <div className="contact-info-icon">
                    <Clock size={18} />
                  </div>
                  <div>
                    <span className="info-meta">Response Time</span>
                    <strong>Within 24 business hours</strong>
                  </div>
                </div>

                <div className="contact-info-item">
                  <div className="contact-info-icon">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <span className="info-meta">Headquarters</span>
                    <strong>Bengaluru, Karnataka, India</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Contact Form */}
            <div className="contact-form-wrapper">
              <div className="form-card-header">
                <span className="form-card-kicker">SEND US A MESSAGE</span>
                <h2>How can we help you?</h2>
                <p>Fill out the form below to reach our optimization engineering team.</p>
              </div>

              {/* Success Notification */}
              {successMessage && (
                <div className="contact-status-box success">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>Message submitted successfully.</strong>
                    <p>{successMessage}</p>
                  </div>
                </div>
              )}

              {/* Error Notification */}
              {errorMessage && (
                <div className="contact-status-box error">
                  <AlertCircle size={18} />
                  <div>
                    <strong>Validation Error</strong>
                    <p>{errorMessage}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="contact-form">
                <div className="form-field">
                  <label htmlFor="contact-name">Your Full Name</label>
                  <input
                    id="contact-name"
                    type="text"
                    placeholder="e.g. Priya Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="contact-email">Email Address</label>
                  <input
                    id="contact-email"
                    type="email"
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    rows={4}
                    placeholder="Tell us what you're working on or how we can assist..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-contact-submit"
                >
                  {loading ? (
                    <>
                      <Loader2 size={17} className="spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Message</span>
                      <Send size={16} />
                    </>
                  )}
                </button>
              </form>

              <div className="form-bottom-note">
                <span>We respect your privacy. Submissions are processed directly through ReRoute backend.</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}