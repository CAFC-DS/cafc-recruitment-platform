import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Row, Col, OverlayTrigger, Tooltip, Spinner, Toast, ToastContainer } from 'react-bootstrap';
import axiosInstance from '../axiosInstance';
import Select from 'react-select';

interface ScoutingAssessmentModalProps {
  show: boolean;
  onHide: () => void;
  selectedPlayer: any;
  onAssessmentSubmitSuccess: () => void;
  editMode?: boolean;
  reportId?: number | null;
  existingReportData?: any;
}

const ScoutingAssessmentModal: React.FC<ScoutingAssessmentModalProps> = ({ show, onHide, selectedPlayer, onAssessmentSubmitSuccess, editMode = false, reportId, existingReportData }) => {
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
    purposeOfAssessment: 'Player Report',
    performanceScore: 5,
    assessmentSummary: '',
    justificationRationale: '',
    flagCategory: '',
  };

  const [formData, setFormData] = useState(initialFormData);

  // Clear form when modal is closed or when switching to new assessment
  useEffect(() => {
    if (!show) {
      // Reset everything when modal closes
      setFormData(initialFormData);
      setAssessmentType(null);
      setFixtureDate('');
      setMatches([]);
      setStrengths([]);
      setWeaknesses([]);
      setPositionAttributes([]);
      setAttributeScores({});
    } else if (show && !editMode) {
      // Clear form when opening for new assessment
      setFormData(initialFormData);
      setAssessmentType(null);
      setFixtureDate('');
      setMatches([]);
      setStrengths([]);
      setWeaknesses([]);
      setPositionAttributes([]);
      setAttributeScores({});
    }
  }, [show, editMode]);

  // Populate form when in edit mode
  useEffect(() => {
    if (editMode && existingReportData) {
      setAssessmentType(existingReportData.reportType);
      setFormData({
        selectedMatch: existingReportData.selectedMatch?.toString() || '',
        playerPosition: existingReportData.playerPosition || '',
        formation: existingReportData.formation || '',
        playerBuild: existingReportData.playerBuild || '',
        playerHeight: existingReportData.playerHeight || '',
        scoutingType: existingReportData.scoutingType || 'Live',
        purposeOfAssessment: existingReportData.purposeOfAssessment || 'Player Report',
        performanceScore: existingReportData.performanceScore || 5,
        assessmentSummary: existingReportData.assessmentSummary || '',
        justificationRationale: existingReportData.justificationRationale || '',
        flagCategory: existingReportData.flagCategory || '',
      });
      
      if (existingReportData.fixtureDate) {
        const fixtureDate = existingReportData.fixtureDate;
        setFixtureDate(fixtureDate);
        
        // Fetch matches for the fixture date in edit mode
        const fetchMatchesForEdit = async () => {
          try {
            const response = await axiosInstance.get(`/matches/date?fixture_date=${fixtureDate}`);
            const sortedMatches = response.data.sort((a: any, b: any) => {
              const matchA = `${a.home_team} vs ${a.away_team}`.toLowerCase();
              const matchB = `${b.home_team} vs ${b.away_team}`.toLowerCase();
              return matchA.localeCompare(matchB);
            });
            setMatches(sortedMatches);
          } catch (error) {
            console.error('Error fetching matches for edit:', error);
            setMatches([]);
          }
        };
        
        // Execute the async function
        fetchMatchesForEdit();
      }
      
      if (existingReportData.strengths) {
        setStrengths(existingReportData.strengths.map((s: string) => ({ value: s, label: s })));
      }
      
      if (existingReportData.weaknesses) {
        setWeaknesses(existingReportData.weaknesses.map((w: string) => ({ value: w, label: w })));
      }
      
      if (existingReportData.attributeScores) {
        setAttributeScores(existingReportData.attributeScores);
      }
      
      if (existingReportData.playerPosition) {
        setPositionAttributes(Object.keys(existingReportData.attributeScores || {}));
      }
    }
  }, [editMode, existingReportData]);

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
    setFormData({ ...formData, selectedMatch: selectedOption ? selectedOption.value.toString() : '' });
  };

  const handleConfirmSubmit = async () => {
    setLoading(true);
    try {
      const payload: any = {
        player_id: selectedPlayer.universal_id,
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

      if (editMode && reportId) {
        await axiosInstance.put(`/scout_reports/${reportId}`, payload);
        setToastMessage('Scout report updated successfully!');
      } else {
        await axiosInstance.post('/scout_reports', payload);
        setToastMessage('Scout report submitted successfully!');
      }
      
      setShowWarningModal(false);
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
      <div style={{ textAlign: 'left', fontSize: '11px' }}>
        10 - Mid Prem & Above<br/>
        9 - Bottom Prem<br/>
        8 - Top Champ<br/>
        7 - Average Champ<br/>
        6 - Top L1<br/>
        5 - Average L1<br/>
        4 - Top L2<br/>
        3 - Average L2<br/>
        2 - National League<br/>
        1 - Step 2 & Below
      </div>
    </Tooltip>
  );

  const playerPositions = ["GK", "RB", "RWB", "RCB(3)", "RCB(2)", "CCB(3)", "LCB(2)", "LCB(3)", "LWB", "LB", "DM", "CM", "RAM", "AM", "LAM", "RW", "LW", "Target Man CF", "In Behind CF"];
  const formations = ["3-5-2","3-4-3","4-1-2-1-2","4-2-2-2","4-2-3-1","4-3-2-1","4-3-3","4-4-1-1","4-4-2"];
  const playerBuilds = ["Slight", "Lean", "Medium", "Strong", "Heavy"];
  const playerHeights = Array.from({ length: 16 }, (_, i) => 5 * 12 + 4 + i).map(inches => `${Math.floor(inches / 12)}'${inches % 12}"`);
  const allStrengths = ["Stature", "Strength", "Power", "Speed - Off The Ball", "Speed - On The Ball", "Acceleration", "Agility", "Leap", "Athleticism", "Aggression", "Stamina", "Intensity", "Work Rate", "Body Language", "Leadership", "Organisation", "Composure", "Creativity", "Decision Making", "Anticipation", "Game Awareness", "Two Footedness", 
    "Versatility","Technical Ability", "Ball Striking", "Attacking Transitions", "Attacking Scanning/Awareness", "Receiving", "Ball Manipulation", "Playing Under Pressure", "Passing", "Passing - Vision", "Passing - Ranges", "Long Passing", "Breaking Lines", "Creative Passing", "Ball Carrying", "Attacking 1v1", "Crossing", "Finding & Creating Space", 
    "Attacking Movement", "Attacking The Box", "Hold Up", "Link Up", "Chance Creation", "Finishing – Inside The Box", "Finishing – Outside The Box", "Finishing - Aerial", "Aerial Duels - Attacking","Aerial Duels - Defensive", "Defensive Transition", "Defensive Scanning/Awareness", "Defensive Positioning", "Line Defending", "Front Footed Defending", 
    "Defending Space", "Defending The Back Post", "Defending The Box", "Stopping The Cross", "1v1 Defending", "Ground Duels", "Clearances", "2nd Balls", "Interceptions", "Recovery Runs", "Tracking Runners", "Pressing","Set Pieces - Delivery","Set Pieces - Attacking" ,"Set Pieces - Marking" ,"Reflexes" ,"Savings 1v1s","Sweeping","GK Positioning","Distribution From Hands"].map(s => ({ value: s, label: s }));
  const allWeaknesses = ["Stature", "Strength", "Power", "Speed - Off The Ball", "Speed - On The Ball", "Acceleration", "Agility", "Leap", "Athleticism", "Aggression", "Stamina", "Intensity", "Work Rate", "Body Language", "Leadership", "Organisation", "Composure", "Creativity", "Decision Making", "Anticipation", "Game Awareness", "Two Footedness", 
    "Versatility","Technical Ability", "Ball Striking", "Attacking Transitions", "Attacking Scanning/Awareness", "Receiving", "Ball Manipulation", "Playing Under Pressure", "Passing", "Passing - Vision", "Passing - Ranges", "Long Passing", "Breaking Lines", "Creative Passing", "Ball Carrying", "Attacking 1v1", "Crossing", "Finding & Creating Space", 
    "Attacking Movement", "Attacking The Box", "Hold Up", "Link Up", "Chance Creation", "Finishing – Inside The Box", "Finishing – Outside The Box", "Finishing - Aerial", "Aerial Duels - Attacking","Aerial Duels - Defensive", "Defensive Transition", "Defensive Scanning/Awareness", "Defensive Positioning", "Line Defending", "Front Footed Defending", 
    "Defending Space", "Defending The Back Post", "Defending The Box", "Stopping The Cross", "1v1 Defending", "Ground Duels", "Clearances", "2nd Balls", "Interceptions", "Recovery Runs", "Tracking Runners", "Pressing","Set Pieces - Delivery","Set Pieces - Attacking" ,"Set Pieces - Marking","Reflexes" ,"Savings 1v1s","Sweeping","GK Positioning","Distribution From Hands"].map(w => ({ value: w, label: w }));

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
                    label: `${match.home_team} vs ${match.away_team}${match.data_source === 'internal' ? ' 📝' : ''}`
                  }))}
                  value={formData.selectedMatch && matches.find(match => match.match_id && match.match_id.toString() === formData.selectedMatch) 
                    ? { 
                        value: parseInt(formData.selectedMatch), 
                        label: `${matches.find(match => match.match_id && match.match_id.toString() === formData.selectedMatch)?.home_team} vs ${matches.find(match => match.match_id && match.match_id.toString() === formData.selectedMatch)?.away_team}` 
                      }
                    : null}
                  onChange={handleMatchSelectChange}
                  placeholder="Select Match"
                  isClearable
                  key={`match-select-player-${formData.selectedMatch}-${matches.length}`}
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
                  <option value="Player Report">Player Report</option>
                  <option value="Loan Report">Loan Report</option>
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
                    label: `${match.home_team} vs ${match.away_team}${match.data_source === 'internal' ? ' 📝' : ''}`
                  }))}
                  value={formData.selectedMatch && matches.find(match => match.match_id && match.match_id.toString() === formData.selectedMatch) 
                    ? { 
                        value: parseInt(formData.selectedMatch), 
                        label: `${matches.find(match => match.match_id && match.match_id.toString() === formData.selectedMatch)?.home_team} vs ${matches.find(match => match.match_id && match.match_id.toString() === formData.selectedMatch)?.away_team}` 
                      }
                    : null}
                  onChange={handleMatchSelectChange}
                  placeholder="Select Match"
                  isClearable
                  key={`match-select-flag-${formData.selectedMatch}-${matches.length}`}
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
            {loading ? <Spinner animation="border" size="sm" /> : (editMode ? 'Update' : 'Submit')}
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
            {assessmentType ? `${getHeaderIcon()} ${editMode ? 'Edit' : ''} ${assessmentType} for ${selectedPlayer?.player_name}` : '📋 Select Assessment Type'}
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

        /* Override dark mode styling for range sliders */
        .form-range {
          background: transparent !important;
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 6px !important;
          border-radius: 5px !important;
          background: linear-gradient(to right, #dee2e6 0%, #dee2e6 100%) !important;
          outline: none !important;
        }

        .form-range::-webkit-slider-track {
          background: #dee2e6 !important;
          height: 6px !important;
          border-radius: 5px !important;
          border: none !important;
        }

        .form-range::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          height: 20px !important;
          width: 20px !important;
          border-radius: 50% !important;
          background: #0d6efd !important;
          cursor: pointer !important;
          border: none !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        }

        .form-range::-moz-range-track {
          background: #dee2e6 !important;
          height: 6px !important;
          border-radius: 5px !important;
          border: none !important;
        }

        .form-range::-moz-range-thumb {
          height: 20px !important;
          width: 20px !important;
          border-radius: 50% !important;
          background: #0d6efd !important;
          cursor: pointer !important;
          border: none !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        }

        /* Force light appearance for range sliders regardless of theme */
        [data-bs-theme="dark"] .form-range,
        body.dark .form-range,
        .dark .form-range {
          background: linear-gradient(to right, #dee2e6 0%, #dee2e6 100%) !important;
        }

        [data-bs-theme="dark"] .form-range::-webkit-slider-track,
        body.dark .form-range::-webkit-slider-track,
        .dark .form-range::-webkit-slider-track {
          background: #dee2e6 !important;
        }

        [data-bs-theme="dark"] .form-range::-webkit-slider-thumb,
        body.dark .form-range::-webkit-slider-thumb,
        .dark .form-range::-webkit-slider-thumb {
          background: #0d6efd !important;
        }

        [data-bs-theme="dark"] .form-range::-moz-range-track,
        body.dark .form-range::-moz-range-track,
        .dark .form-range::-moz-range-track {
          background: #dee2e6 !important;
        }

        [data-bs-theme="dark"] .form-range::-moz-range-thumb,
        body.dark .form-range::-moz-range-thumb,
        .dark .form-range::-moz-range-thumb {
          background: #0d6efd !important;
        }
      `}</style>
    </>
  );
};

export default ScoutingAssessmentModal;
