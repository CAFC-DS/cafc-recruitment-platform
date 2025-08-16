import React, { useState } from 'react';
import { Modal, Form, Button, Row, Col, OverlayTrigger, Tooltip, Spinner, Toast, ToastContainer } from 'react-bootstrap';
import axiosInstance from '../axiosInstance';
import Select from 'react-select';

interface ScoutingAssessmentModalProps {
  show: boolean;
  onHide: () => void;
  selectedPlayer: any;
  onAssessmentSubmitSuccess: () => void;
}

const ScoutingAssessmentModal: React.FC<ScoutingAssessmentModalProps> = ({ show, onHide, selectedPlayer, onAssessmentSubmitSuccess }) => {
  const [assessmentType, setAssessmentType] = useState<'Player Assessment' | 'Flag' | 'Clips' | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');
  const [fixtureDate, setFixtureDate] = useState('');
  const [matches, setMatches] = useState<any[]>([]);
  const [strengths, setStrengths] = useState<any[]>([]);
  const [weaknesses, setWeaknesses] = useState<any[]>([]);
  const [positionAttributes, setPositionAttributes] = useState<string[]>([]);
  const [attributeScores, setAttributeScores] = useState<{ [key: string]: number }>({});

  const initialFormData = {
    selectedMatch: '',
    playerPosition: '',
    formation: '',
    playerBuild: '',
    playerHeight: '',
    scoutingType: 'Live',
    purposeOfAssessment: 'Player Assessment',
    performanceScore: 5,
    assessmentSummary: '',
    justificationRationale: '',
    flagCategory: '',
  };

  const [formData, setFormData] = useState(initialFormData);

  const isFormValid = () => {
    if (assessmentType === 'Player Assessment') {
      return (
        formData.selectedMatch &&
        formData.playerPosition &&
        formData.playerHeight &&
        formData.assessmentSummary &&
        formData.justificationRationale &&
        formData.performanceScore > 0 &&
        formData.scoutingType &&
        formData.purposeOfAssessment
      );
    } else if (assessmentType === 'Flag') {
      return (
        formData.selectedMatch &&
        formData.playerPosition &&
        formData.playerBuild &&
        formData.playerHeight &&
        formData.scoutingType &&
        formData.assessmentSummary &&
        formData.flagCategory
      );
    } else if (assessmentType === 'Clips') {
      return (
        formData.playerPosition &&
        formData.playerBuild &&
        formData.playerHeight &&
        formData.assessmentSummary &&
        formData.performanceScore > 0 &&
        strengths.length > 0 &&
        weaknesses.length > 0
      );
    }
    return false;
  };

  const handleFixtureDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setFixtureDate(date);
    if (date) {
      try {
        const response = await axiosInstance.get(`/matches/date?fixture_date=${date}`);
        const sortedMatches = response.data.sort((a: any, b: any) => {
          const matchA = `${a.home_team} vs ${a.away_team}`.toLowerCase();
          const matchB = `${b.home_team} vs ${b.away_team}`.toLowerCase();
          return matchA.localeCompare(matchB);
        });
        setMatches(sortedMatches);
      } catch (error) {
        console.error('Error fetching matches:', error);
        setMatches([]);
      }
    } else {
      setMatches([]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handlePositionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const position = e.target.value;
    setFormData({ ...formData, playerPosition: position });
    if (position) {
      try {
        const response = await axiosInstance.get(`/attributes/${position}`);
        setPositionAttributes(response.data);
        const initialScores: { [key: string]: number } = {};
        response.data.forEach((attr: string) => {
          initialScores[attr] = 0;
        });
        setAttributeScores(initialScores);
      } catch (error) {
        console.error('Error fetching attributes:', error);
        setPositionAttributes([]);
      }
    } else {
      setPositionAttributes([]);
    }
  };

  const handleAttributeScoreChange = (attribute: string, value: number) => {
    setAttributeScores({ ...attributeScores, [attribute]: value });
  };

  const handleMultiSelectChange = (selectedOptions: any, field: 'strengths' | 'weaknesses') => {
    if (field === 'strengths') {
      setStrengths(selectedOptions);
    } else {
      setWeaknesses(selectedOptions);
    }
  };

  const handleMatchSelectChange = (selectedOption: any) => {
    setFormData({ ...formData, selectedMatch: selectedOption ? selectedOption.value : '' });
  };

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      const payload: any = {
        player_id: selectedPlayer.player_id,
        reportType: assessmentType,
      };

      if (assessmentType === 'Player Assessment') {
        payload.selectedMatch = parseInt(formData.selectedMatch, 10);
        payload.playerPosition = formData.playerPosition;
        payload.formation = formData.formation;
        payload.playerBuild = formData.playerBuild;
        payload.playerHeight = formData.playerHeight;
        payload.scoutingType = formData.scoutingType;
        payload.purposeOfAssessment = formData.purposeOfAssessment;
        payload.performanceScore = formData.performanceScore;
        payload.assessmentSummary = formData.assessmentSummary;
        payload.justificationRationale = formData.justificationRationale;
        payload.strengths = strengths.map(s => s.value);
        payload.weaknesses = weaknesses.map(w => w.value);
        payload.attributeScores = attributeScores;
      } else if (assessmentType === 'Flag') {
        payload.selectedMatch = parseInt(formData.selectedMatch, 10);
        payload.playerPosition = formData.playerPosition;
        payload.playerBuild = formData.playerBuild;
        payload.playerHeight = formData.playerHeight;
        payload.scoutingType = formData.scoutingType;
        payload.assessmentSummary = formData.assessmentSummary;
        payload.flagCategory = formData.flagCategory;
      } else if (assessmentType === 'Clips') {
        payload.playerPosition = formData.playerPosition;
        payload.playerBuild = formData.playerBuild;
        payload.playerHeight = formData.playerHeight;
        payload.strengths = strengths.map(s => s.value);
        payload.weaknesses = weaknesses.map(w => w.value);
        payload.assessmentSummary = formData.assessmentSummary;
        payload.performanceScore = formData.performanceScore;
      }

      await axiosInstance.post('/scout_reports', payload);
      
      setShowWarningModal(false);
      setToastMessage('Scout report submitted successfully!');
      setToastVariant('success');
      setShowToast(true);
      onAssessmentSubmitSuccess();
      onHide();
    } catch (error) {
      console.error('Error submitting form:', error);
      setToastMessage('Failed to submit scout report. Please try again.');
      setToastVariant('danger');
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (assessmentType === 'Player Assessment' && Object.values(attributeScores).some(score => score === 0)) {
      setShowWarningModal(true);
    } else {
      handleConfirmSubmit();
    }
  };

  const renderTooltip = (props: any) => (
    <Tooltip id="button-tooltip" {...props}>
      0: Very Poor, 5: Average, 10: Excellent
    </Tooltip>
  );

  const playerPositions = ["GK", "RB", "RWB", "RCB(3)", "RCB(2)", "CCB(3)", "LCB(2)", "LCB(3)", "LWB", "LB", "DM", "CM", "RAM", "AM", "LAM", "RW", "LW", "Target Man CF", "In Behind CF"];
  const formations = ["3-5-2","3-4-3","4-1-2-1-2","4-2-2-2","4-2-3-1","4-3-2-1","4-3-3","4-4-1-1","4-4-2"];
  const playerBuilds = ["Slim", "Athletic", "Muscular", "Stocky", "Lean"];
  const playerHeights = Array.from({ length: 16 }, (_, i) => 5 * 12 + 4 + i).map(inches => `${Math.floor(inches / 12)}'${inches % 12}"`);
  const allStrengths = ["Stature", "Strength", "Power", "Speed - Off The Ball", "Speed - On The Ball", "Acceleration", "Agility", "Leap", "Athleticism", "Aggression", "Stamina", "Intensity", "Work Rate", "Body Language", "Leadership", "Organisation", "Composure", "Creativity", "Decision Making", "Anticipation", "Game Awareness", "Two Footedness", 
    "Versatility","Technical Ability", "Ball Striking", "Attacking Transitions", "Attacking Scanning/Awareness", "Receiving", "Ball Manipulation", "Playing Under Pressure", "Passing", "Passing - Vision", "Passing - Ranges", "Long Passing", "Breaking Lines", "Creative Passing", "Ball Carrying", "Attacking 1v1", "Crossing", "Finding & Creating Space", 
    "Attacking Movement", "Attacking The Box", "Hold Up", "Link Up", "Chance Creation", "Finishing – Inside The Box", "Finishing – Outside The Box", "Finishing - Aerial", "Aerial Duels - Attacking","Aerial Duels - Defensive", "Defensive Transition", "Defensive Scanning/Awareness", "Defensive Positioning", "Line Defending", "Front Footed Defending", 
    "Defending Space", "Defending The Back Post", "Defending The Box", "Stopping The Cross", "1v1 Defending", "Ground Duels", "Clearances", "2nd Balls", "Interceptions", "Recovery Runs", "Tracking Runners", "Pressing","Set Pieces - Delivery","Set Pieces - Attacking" ,"Set Pieces - Marking"].map(s => ({ value: s, label: s }));
  const allWeaknesses = ["Stature", "Strength", "Power", "Speed - Off The Ball", "Speed - On The Ball", "Acceleration", "Agility", "Leap", "Athleticism", "Aggression", "Stamina", "Intensity", "Work Rate", "Body Language", "Leadership", "Organisation", "Composure", "Creativity", "Decision Making", "Anticipation", "Game Awareness", "Two Footedness", 
    "Versatility","Technical Ability", "Ball Striking", "Attacking Transitions", "Attacking Scanning/Awareness", "Receiving", "Ball Manipulation", "Playing Under Pressure", "Passing", "Passing - Vision", "Passing - Ranges", "Long Passing", "Breaking Lines", "Creative Passing", "Ball Carrying", "Attacking 1v1", "Crossing", "Finding & Creating Space", 
    "Attacking Movement", "Attacking The Box", "Hold Up", "Link Up", "Chance Creation", "Finishing – Inside The Box", "Finishing – Outside The Box", "Finishing - Aerial", "Aerial Duels - Attacking","Aerial Duels - Defensive", "Defensive Transition", "Defensive Scanning/Awareness", "Defensive Positioning", "Line Defending", "Front Footed Defending", 
    "Defending Space", "Defending The Back Post", "Defending The Box", "Stopping The Cross", "1v1 Defending", "Ground Duels", "Clearances", "2nd Balls", "Interceptions", "Recovery Runs", "Tracking Runners", "Pressing","Set Pieces - Delivery","Set Pieces - Attacking" ,"Set Pieces - Marking"].map(w => ({ value: w, label: w }));

  const renderContent = () => {
    if (!assessmentType) {
      return (
        <div className="d-grid gap-2">
          <Button variant="primary" size="lg" onClick={() => setAssessmentType('Player Assessment')}>
            ⚽ Player Assessment
          </Button>
          <Button variant="warning" size="lg" onClick={() => setAssessmentType('Flag')}>
            🚩 Flag Assessment
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setAssessmentType('Clips')}>
            🎬 Clips Assessment
          </Button>
        </div>
      );
    }

    return (
      <Form onSubmit={handleSubmit}>
        <p><span className="text-danger">*</span> indicates a required field.</p>
        {assessmentType === 'Player Assessment' && (
          <>
            {/* Player Assessment Form Fields */}
            <Row className="mb-3">
              <Form.Group as={Col} controlId="fixtureDate">
                <Form.Label>Fixture Date <span className="text-danger">*</span></Form.Label>
                <Form.Control type="date" value={fixtureDate} onChange={handleFixtureDateChange} />
              </Form.Group>
              <Form.Group as={Col} controlId="selectedMatch">
                <Form.Label>Match <span className="text-danger">*</span></Form.Label>
                <Select
                  isSearchable
                  isDisabled={!fixtureDate || matches.length === 0}
                  options={matches.map(match => ({
                    value: match.match_id,
                    label: `${match.home_team} vs ${match.away_team}`
                  }))}
                  value={matches.find(match => match.match_id.toString() === formData.selectedMatch) 
                    ? { value: formData.selectedMatch, label: `${matches.find(match => match.match_id.toString() === formData.selectedMatch)?.home_team} vs ${matches.find(match => match.match_id.toString() === formData.selectedMatch)?.away_team}` }
                    : null}
                  onChange={handleMatchSelectChange}
                  placeholder="Select Match"
                  isClearable
                />
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="playerPosition">
                <Form.Label>Player Position <span className="text-danger">*</span></Form.Label>
                <Form.Select name="playerPosition" value={formData.playerPosition} onChange={handlePositionChange}>
                  <option value="">Select Position</option>
                  {playerPositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="formation">
                <Form.Label>Formation</Form.Label>
                <Form.Select name="formation" value={formData.formation} onChange={handleChange}>
                  <option value="">Select Formation</option>
                  {formations.map(form => <option key={form} value={form}>{form}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerBuild">
                <Form.Label>Player Build</Form.Label>
                <Form.Select name="playerBuild" value={formData.playerBuild} onChange={handleChange}>
                  <option value="">Select Build</option>
                  {playerBuilds.map(build => <option key={build} value={build}>{build}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerHeight">
                <Form.Label>Player Height <span className="text-danger">*</span></Form.Label>
                <Form.Select name="playerHeight" value={formData.playerHeight} onChange={handleChange}>
                  <option value="">Select Height</option>
                  {playerHeights.map(height => <option key={height} value={height}>{height}</option>)}
                </Form.Select>
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="scoutingType">
                <Form.Label>Scouting Type <span className="text-danger">*</span></Form.Label>
                <Form.Select name="scoutingType" value={formData.scoutingType} onChange={handleChange}>
                  <option value="Live">Live</option>
                  <option value="Video">Video</option>
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="purposeOfAssessment">
                <Form.Label>Purpose of Assessment <span className="text-danger">*</span></Form.Label>
                <Form.Select name="purposeOfAssessment" value={formData.purposeOfAssessment} onChange={handleChange}>
                  <option value="Player Assessment">Player Assessment</option>
                  <option value="Loan Assessment">Loan Assessment</option>
                </Form.Select>
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="strengths">
                <Form.Label>Strengths</Form.Label>
                <Select isMulti options={allStrengths} value={strengths} onChange={(selected) => handleMultiSelectChange(selected, 'strengths')} />
              </Form.Group>
              <Form.Group as={Col} controlId="weaknesses">
                <Form.Label>Weaknesses</Form.Label>
                <Select isMulti options={allWeaknesses} value={weaknesses} onChange={(selected) => handleMultiSelectChange(selected, 'weaknesses')} />
              </Form.Group>
            </Row>
            {positionAttributes.length > 0 && (
              <Row className="mb-3">
                {positionAttributes.map(attr => (
                  <Col md={6} key={attr}>
                    <Form.Group controlId={`attribute_${attr}`}>
                      <OverlayTrigger placement="top" overlay={renderTooltip}>
                        <Form.Label>{attr} ({attributeScores[attr] || 0}) <span className="text-danger">*</span></Form.Label>
                      </OverlayTrigger>
                      <Form.Range min="0" max="10" value={attributeScores[attr] || 0} onChange={(e) => handleAttributeScoreChange(attr, parseInt(e.target.value, 10))} />
                    </Form.Group>
                  </Col>
                ))}
              </Row>
            )}
            <Form.Group className="mb-3" controlId="assessmentSummary">
              <Form.Label>Assessment Summary <span className="text-danger">*</span></Form.Label>
              <Form.Control as="textarea" rows={3} name="assessmentSummary" value={formData.assessmentSummary} onChange={handleChange} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="justificationRationale">
              <Form.Label>Justification/Rationale <span className="text-danger">*</span></Form.Label>
              <Form.Control as="textarea" rows={3} name="justificationRationale" value={formData.justificationRationale} onChange={handleChange} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="performanceScore">
              <OverlayTrigger placement="top" overlay={renderTooltip}>
                <Form.Label>Performance Score ({formData.performanceScore}) <span className="text-danger">*</span></Form.Label>
              </OverlayTrigger>
              <Form.Range name="performanceScore" min="1" max="10" value={formData.performanceScore} onChange={handleChange} />
            </Form.Group>
          </>
        )}

        {assessmentType === 'Flag' && (
          <>
            {/* Flag Assessment Form Fields */}
            <Row className="mb-3">
              <Form.Group as={Col} controlId="fixtureDate">
                <Form.Label>Fixture Date <span className="text-danger">*</span></Form.Label>
                <Form.Control type="date" value={fixtureDate} onChange={handleFixtureDateChange} />
              </Form.Group>
              <Form.Group as={Col} controlId="selectedMatch">
                <Form.Label>Match <span className="text-danger">*</span></Form.Label>
                <Select
                  isSearchable
                  isDisabled={!fixtureDate || matches.length === 0}
                  options={matches.map(match => ({
                    value: match.match_id,
                    label: `${match.home_team} vs ${match.away_team}`
                  }))}
                  value={matches.find(match => match.match_id.toString() === formData.selectedMatch) 
                    ? { value: formData.selectedMatch, label: `${matches.find(match => match.match_id.toString() === formData.selectedMatch)?.home_team} vs ${matches.find(match => match.match_id.toString() === formData.selectedMatch)?.away_team}` }
                    : null}
                  onChange={handleMatchSelectChange}
                  placeholder="Select Match"
                  isClearable
                />
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="playerPosition">
                <Form.Label>Player Position <span className="text-danger">*</span></Form.Label>
                <Form.Select name="playerPosition" value={formData.playerPosition} onChange={handlePositionChange}>
                  <option value="">Select Position</option>
                  {playerPositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerBuild">
                <Form.Label>Player Build <span className="text-danger">*</span></Form.Label>
                <Form.Select name="playerBuild" value={formData.playerBuild} onChange={handleChange}>
                  <option value="">Select Build</option>
                  {playerBuilds.map(build => <option key={build} value={build}>{build}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerHeight">
                <Form.Label>Player Height <span className="text-danger">*</span></Form.Label>
                <Form.Select name="playerHeight" value={formData.playerHeight} onChange={handleChange}>
                  <option value="">Select Height</option>
                  {playerHeights.map(height => <option key={height} value={height}>{height}</option>)}
                </Form.Select>
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="scoutingType">
                <Form.Label>Scouting Type <span className="text-danger">*</span></Form.Label>
                <Form.Select name="scoutingType" value={formData.scoutingType} onChange={handleChange}>
                  <option value="">Select Type</option>
                  <option value="Live">Live</option>
                  <option value="Video">Video</option>
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="flagCategory">
                <Form.Label>Flag Category <span className="text-danger">*</span></Form.Label>
                <Form.Select name="flagCategory" value={formData.flagCategory} onChange={handleChange}>
                  <option value="">Select Category</option>
                  <option value="Positive">Positive</option>
                  <option value="Neutral">Neutral</option>
                  <option value="Negative">Negative</option>
                </Form.Select>
              </Form.Group>
            </Row>
            <Form.Group className="mb-3" controlId="assessmentSummary">
              <Form.Label>Summary Notes <span className="text-danger">*</span></Form.Label>
              <Form.Control as="textarea" rows={3} name="assessmentSummary" value={formData.assessmentSummary} onChange={handleChange} />
            </Form.Group>
          </>
        )}

        {assessmentType === 'Clips' && (
          <>
            {/* Clips Assessment Form Fields */}
            <Row className="mb-3">
              <Form.Group as={Col} controlId="playerPosition">
                <Form.Label>Player Position <span className="text-danger">*</span></Form.Label>
                <Form.Select name="playerPosition" value={formData.playerPosition} onChange={handlePositionChange}>
                  <option value="">Select Position</option>
                  {playerPositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerBuild">
                <Form.Label>Player Build <span className="text-danger">*</span></Form.Label>
                <Form.Select name="playerBuild" value={formData.playerBuild} onChange={handleChange}>
                  <option value="">Select Build</option>
                  {playerBuilds.map(build => <option key={build} value={build}>{build}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group as={Col} controlId="playerHeight">
                <Form.Label>Player Height <span className="text-danger">*</span></Form.Label>
                <Form.Select name="playerHeight" value={formData.playerHeight} onChange={handleChange}>
                  <option value="">Select Height</option>
                  {playerHeights.map(height => <option key={height} value={height}>{height}</option>)}
                </Form.Select>
              </Form.Group>
            </Row>
            <Row className="mb-3">
              <Form.Group as={Col} controlId="strengths">
                <Form.Label>Strengths <span className="text-danger">*</span></Form.Label>
                <Select isMulti options={allStrengths} value={strengths} onChange={(selected) => handleMultiSelectChange(selected, 'strengths')} />
              </Form.Group>
              <Form.Group as={Col} controlId="weaknesses">
                <Form.Label>Weaknesses <span className="text-danger">*</span></Form.Label>
                <Select isMulti options={allWeaknesses} value={weaknesses} onChange={(selected) => handleMultiSelectChange(selected, 'weaknesses')} />
              </Form.Group>
            </Row>
            <Form.Group className="mb-3" controlId="assessmentSummary">
              <Form.Label>Report Summary <span className="text-danger">*</span></Form.Label>
              <Form.Control as="textarea" rows={3} name="assessmentSummary" value={formData.assessmentSummary} onChange={handleChange} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="performanceScore">
              <OverlayTrigger placement="top" overlay={renderTooltip}>
                <Form.Label>Performance Score ({formData.performanceScore}) <span className="text-danger">*</span></Form.Label>
              </OverlayTrigger>
              <Form.Range name="performanceScore" min="1" max="10" value={formData.performanceScore} onChange={handleChange} />
            </Form.Group>
          </>
        )}

        <div className="d-flex justify-content-between">
          <Button variant="danger" type="submit" disabled={!isFormValid() || loading}>
            {loading ? <Spinner animation="border" size="sm" /> : 'Submit'}
          </Button>
          <Button variant="secondary" onClick={() => setAssessmentType(null)}>Back</Button>
        </div>
      </Form>
    );
  };

  const getHeaderStyle = () => {
    return { backgroundColor: '#000000', color: 'white' };
  };

  const getHeaderIcon = () => {
    switch (assessmentType) {
      case 'Player Assessment':
        return '⚽';
      case 'Flag':
        return '🚩';
      case 'Clips':
        return '🎬';
      default:
        return '📋';
    }
  };

  return (
    <>
      <Modal show={show} onHide={onHide} size="lg">
        <Modal.Header closeButton style={getHeaderStyle()} className="modal-header-dark">
          <Modal.Title>
            {assessmentType ? `${getHeaderIcon()} ${assessmentType} for ${selectedPlayer?.player_name}` : '📋 Select Assessment Type'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {renderContent()}
        </Modal.Body>
      </Modal>

      <Modal show={showWarningModal} onHide={() => setShowWarningModal(false)}>
        <Modal.Header closeButton style={{ backgroundColor: '#000000', color: 'white' }} className="modal-header-dark">
          <Modal.Title>Warning</Modal.Title>
        </Modal.Header>
        <Modal.Body>One or more attribute scores are 0. Are you sure you want to continue?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowWarningModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirmSubmit}>
            Continue
          </Button>
        </Modal.Footer>
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

      <style>{`
        .modal-header-dark .btn-close {
          filter: invert(1) grayscale(100%) brightness(200%);
        }
      `}</style>
    </>
  );
};

export default ScoutingAssessmentModal;
