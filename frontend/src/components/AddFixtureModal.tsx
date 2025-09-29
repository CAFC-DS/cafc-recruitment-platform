import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Spinner, Toast, ToastContainer } from 'react-bootstrap';
import axiosInstance from '../axiosInstance';
import { useAuth } from '../App'; // Import useAuth

interface AddFixtureModalProps {
  show: boolean;
  onHide: () => void;
}

const AddFixtureModal: React.FC<AddFixtureModalProps> = ({ show, onHide }) => {
  const [formData, setFormData] = useState({
    homeTeam: '',
    awayTeam: '',
    date: '',
  });
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleClear = () => {
    setFormData({
      homeTeam: '',
      awayTeam: '',
      date: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axiosInstance.post('/matches', formData);
      setToastMessage('Fixture added successfully!');
      setToastVariant('success');
      setShowToast(true);
      handleClear(); // Clear form data on successful submission
      onHide(); // Close the modal after successful submission
    } catch (error) {
      console.error('Error adding fixture:', error);
      setToastMessage('Error adding fixture. Please try again.');
      setToastVariant('danger');
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal show={show} onHide={onHide}>
        <Modal.Header closeButton style={{ backgroundColor: '#000000', color: 'white' }} className="modal-header-dark">
          <Modal.Title>Add New Fixture</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="homeTeam">
              <Form.Label>Home Team</Form.Label>
              <Form.Control type="text" name="homeTeam" value={formData.homeTeam} onChange={handleChange} placeholder="Enter home team name" required />
            </Form.Group>
            <Form.Group className="mb-3" controlId="awayTeam">
              <Form.Label>Away Team</Form.Label>
              <Form.Control type="text" name="awayTeam" value={formData.awayTeam} onChange={handleChange} placeholder="Enter away team name" required />
            </Form.Group>
            <Form.Group className="mb-3" controlId="date">
              <Form.Label>Date</Form.Label>
              <Form.Control type="date" name="date" value={formData.date} onChange={handleChange} required />
            </Form.Group>
            <div className="d-flex justify-content-between">
              <Button variant="primary" type="submit" disabled={loading}>
                {loading ? <Spinner animation="border" size="sm" /> : 'Submit'}
              </Button>
              <Button variant="secondary" type="button" onClick={handleClear} disabled={loading}>
                Clear
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      <ToastContainer position="top-end" className="p-3">
        <Toast onClose={() => setShowToast(false)} show={showToast} delay={3000} autohide bg={toastVariant}>
          <Toast.Header>
            <strong className="me-auto">Notification</strong>
          </Toast.Header>
          <Toast.Body className={toastVariant === 'danger' ? 'text-white' : ''}>
            {toastMessage}
          </Toast.Body>
        </Toast>
      </ToastContainer>
    </>
  );
};

export default AddFixtureModal;