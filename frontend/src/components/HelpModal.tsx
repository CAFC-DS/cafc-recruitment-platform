import React from "react";
import { Modal, Accordion } from "react-bootstrap";
import "./HelpModal.css";

interface HelpModalProps {
  show: boolean;
  onHide: () => void;
  userRole: string;
}

const HelpModal: React.FC<HelpModalProps> = ({ show, onHide, userRole }) => {
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const isScout = userRole === "scout";
  const isLoan = userRole === "loan";
  const canViewAnalytics = isAdmin || isManager;

  return (
    <>
      <Modal show={show} onHide={onHide} size="lg" centered>
        <Modal.Header
          closeButton
          style={{ backgroundColor: "#000000", color: "white" }}
          className="modal-header-dark"
        >
          <Modal.Title>❓ Help & Guide</Modal.Title>
        </Modal.Header>
        <Modal.Body>
        <Accordion alwaysOpen={false}>
          {/* Navigation - All Roles */}
          <Accordion.Item eventKey="0">
            <Accordion.Header>Navigation</Accordion.Header>
            <Accordion.Body>
              <h6>Main Pages</h6>
              <ul>
                <li>
                  <strong>Home (Dashboard):</strong> View recent scout reports,
                  flag reports, top performers, and intel reports
                </li>
                <li>
                  <strong>Scouting:</strong> Access all your scout reports with
                  advanced filtering options
                </li>
                <li>
                  <strong>Intel:</strong> Manage intelligence reports including
                  transfer and contract information
                </li>
                {canViewAnalytics && (
                  <li>
                    <strong>Analytics:</strong> View comprehensive analytics on
                    players, matches, teams, and scout activity
                  </li>
                )}
                {isAdmin && (
                  <li>
                    <strong>Admin Panel:</strong> Manage users and resolve data
                    clashes
                  </li>
                )}
              </ul>
              <h6>Navbar Features</h6>
              <ul>
                <li>
                  <strong>Player Search:</strong> Global search bar to quickly
                  find any player
                </li>
                <li>
                  <strong>Add New Menu:</strong> Quick access to create scout
                  reports, fixtures, intel, players, and feedback
                </li>
                <li>
                  <strong>Queue Manager:</strong> View and manage queued scout
                  reports (shows count badge when reports are queued)
                </li>
                <li>
                  <strong>Settings:</strong> Toggle dark/light mode, access
                  help, and logout
                </li>
              </ul>
            </Accordion.Body>
          </Accordion.Item>

          {/* Scout Reports - Scout and Loan Roles */}
          {(isScout || isLoan) && (
            <Accordion.Item eventKey="1">
              <Accordion.Header>Scout Reports</Accordion.Header>
              <Accordion.Body>
                <h6>Report Types</h6>
                <ul>
                  <li>
                    <strong>Player Assessment:</strong> Full comprehensive
                    evaluation with match context, performance scores, and
                    detailed attributes
                  </li>
                  <li>
                    <strong>Flag:</strong> Quick identification of promising
                    players with Red/Amber/Green categories
                  </li>
                  <li>
                    <strong>Clips:</strong> Video/observation notes without full
                    match context
                  </li>
                </ul>

                <h6>Creating a Scout Report</h6>
                <ol>
                  <li>
                    Click "New Scout Report" in the navbar or on the Scouting
                    page
                  </li>
                  <li>Select the report type (Player Assessment, Flag, or Clips)</li>
                  <li>
                    Search and select the player (or add a new player if not
                    found)
                  </li>
                  <li>
                    For Player Assessments and Flags: Select the match/fixture
                  </li>
                  <li>Fill in required fields:</li>
                  <ul>
                    <li>Player Position</li>
                    <li>Player Build (Stocky, Athletic, Slight)</li>
                    <li>Player Height (&lt;175cm, 175-185cm, &gt;185cm)</li>
                    <li>Assessment Summary</li>
                    <li>
                      Performance Score (1-10) for Player Assessments and Clips
                    </li>
                    <li>
                      Position-specific attributes (Technical, Physical, Mental)
                    </li>
                  </ul>
                  <li>Add strengths and weaknesses (multi-select tags)</li>
                  <li>
                    Choose "Submit" to save immediately or "Add to Queue" for
                    batch submission
                  </li>
                </ol>

                <h6>Editing/Deleting Reports</h6>
                <ul>
                  <li>
                    You can only edit or delete your own reports (
                    {isLoan
                      ? "your own reports and loan reports you created"
                      : "reports you created"}
                    )
                  </li>
                  <li>
                    Click the edit icon on any of your reports to modify them
                  </li>
                  <li>Click the delete icon and confirm to remove a report</li>
                </ul>

                {isLoan && (
                  <>
                    <h6>Loan Reports (Special Access)</h6>
                    <ul>
                      <li>
                        You can view ALL reports marked with "Loan Report"
                        purpose, regardless of who created them
                      </li>
                      <li>
                        Your own reports with "Loan Report" purpose will be
                        visible to other Loan role users
                      </li>
                    </ul>
                  </>
                )}
              </Accordion.Body>
            </Accordion.Item>
          )}

          {/* Queue System - Scout and Loan Roles */}
          {(isScout || isLoan) && (
            <Accordion.Item eventKey="2">
              <Accordion.Header>Queue System</Accordion.Header>
              <Accordion.Body>
                <h6>What is the Queue?</h6>
                <p>
                  The queue system allows you to rapidly enter multiple reports
                  from the same fixture without losing context or submitting
                  each one individually.
                </p>

                <h6>How to Use the Queue</h6>
                <ol>
                  <li>Fill out a scout report as normal</li>
                  <li>Click "Add to Queue" instead of "Submit"</li>
                  <li>
                    The report is saved locally and the form clears (but keeps
                    the match context)
                  </li>
                  <li>
                    Enter the next player's report quickly - the fixture will
                    be pre-selected
                  </li>
                  <li>Repeat for all players from the same match</li>
                  <li>
                    Click the Queue icon in the navbar (will show a count
                    badge)
                  </li>
                  <li>Review your queued reports</li>
                  <li>Submit all reports at once with "Submit All"</li>
                </ol>

                <h6>Queue Features</h6>
                <ul>
                  <li>
                    Reports persist across page refreshes (stored locally in
                    your browser)
                  </li>
                  <li>Edit or remove individual queued reports before submission</li>
                  <li>Failed submissions remain in queue for retry</li>
                  <li>Success/failure notifications for each report</li>
                  <li>Queue counter badge shows how many reports are queued</li>
                </ul>

                <h6>Tips</h6>
                <ul>
                  <li>
                    Use the queue when scouting multiple players from the same
                    match
                  </li>
                  <li>
                    The system remembers your last fixture to speed up batch
                    entry
                  </li>
                  <li>
                    You can clear the fixture context manually if switching to a
                    different match
                  </li>
                </ul>
              </Accordion.Body>
            </Accordion.Item>
          )}

          {/* Filters & Search - All Roles */}
          <Accordion.Item eventKey="3">
            <Accordion.Header>Filters & Search</Accordion.Header>
            <Accordion.Body>
              <h6>Global Player Search</h6>
              <p>
                Use the search bar in the navbar to quickly find any player:
              </p>
              <ul>
                <li>Start typing a player's name</li>
                <li>Results appear in a dropdown after 300ms</li>
                <li>Use arrow keys to navigate results</li>
                <li>Press Enter or click to view player profile</li>
                <li>Search is accent-insensitive (e.g., "Muller" finds "Müller")</li>
              </ul>

              <h6>Scouting Page Filters</h6>
              <p>
                <strong>Quick Time Filters:</strong>
              </p>
              <ul>
                <li>Last 7 Days</li>
                <li>Last 30 Days</li>
                <li>Last 90 Days</li>
                <li>All Time</li>
              </ul>

              <p>
                <strong>Advanced Filters</strong> (click "Show Advanced
                Filters"):
              </p>
              <ul>
                <li>Performance Scores (select multiple: 1-10)</li>
                <li>Scout Name search</li>
                <li>Player Name search</li>
                <li>Age Range (min/max)</li>
                <li>Date Range (from/to)</li>
                <li>Report Type (Player Assessment, Flag, Clips)</li>
                <li>Scouting Type (Live, Video)</li>
                <li>Position Filter</li>
              </ul>
              <p>All filters work together and apply in real-time.</p>

              <h6>Intel Page Filters</h6>
              <ul>
                <li>Recency Filter (7/30/90 days, All)</li>
                <li>Action Required toggle</li>
                <li>Contact Name search</li>
                <li>Player Name search</li>
                <li>Date Range filter</li>
              </ul>

              <h6>View Modes</h6>
              <p>Toggle between Card View and Table View:</p>
              <ul>
                <li>
                  <strong>Card View:</strong> Visual cards with badges and
                  highlights
                </li>
                <li>
                  <strong>Table View:</strong> Dense tabular format for scanning
                  many records
                </li>
                <li>Your preference is saved automatically</li>
              </ul>
            </Accordion.Body>
          </Accordion.Item>

          {/* Player Management - All Roles */}
          <Accordion.Item eventKey="4">
            <Accordion.Header>Player Management</Accordion.Header>
            <Accordion.Body>
              <h6>Adding a New Player</h6>
              <ol>
                <li>Click "Add New" in navbar → "Add Player"</li>
                <li>Fill in required fields:</li>
                <ul>
                  <li>First Name</li>
                  <li>Last Name</li>
                  <li>Birth Date</li>
                  <li>Squad Name (team)</li>
                  <li>Position</li>
                </ul>
                <li>Click "Add Player"</li>
                <li>
                  Player will be available immediately in dropdowns and search
                </li>
              </ol>

              <h6>Viewing Player Profiles</h6>
              <p>Player profiles show comprehensive information:</p>
              <ul>
                <li>
                  <strong>Basic Info:</strong> Name, age, squad, position
                </li>
                <li>
                  <strong>Scout Reports History:</strong> All reports for this
                  player{" "}
                  {isScout
                    ? "(only your reports)"
                    : isLoan
                    ? "(your reports and all loan reports)"
                    : "(all reports)"}
                </li>
                <li>
                  <strong>Attribute Radar Charts:</strong> Position-specific
                  visualizations
                </li>
                <li>
                  <strong>Performance Trends:</strong> Score trends over time
                </li>
                <li>
                  <strong>Intel Reports:</strong> Transfer and contract
                  information
                </li>
                <li>
                  <strong>Notes:</strong> Private and shared notes
                </li>
              </ul>

              <h6>Adding Notes to Player Profiles</h6>
              <ul>
                <li>
                  <strong>Private Notes:</strong> Only visible to you
                </li>
                <li>
                  <strong>Shared Notes:</strong> Visible to your team
                </li>
                <li>All notes are timestamped and attributed</li>
              </ul>

              <h6>Adding Fixtures</h6>
              <ol>
                <li>Click "Add New" in navbar → "Add Fixture"</li>
                <li>Enter home team name</li>
                <li>Enter away team name</li>
                <li>Select match date</li>
                <li>Submit</li>
                <li>Fixture will be available in scout report dropdowns</li>
              </ol>
            </Accordion.Body>
          </Accordion.Item>

          {/* Analytics Dashboard - Admin and Manager Only */}
          {canViewAnalytics && (
            <Accordion.Item eventKey="5">
              <Accordion.Header>Analytics Dashboard</Accordion.Header>
              <Accordion.Body>
                <h6>Available Analytics Tabs</h6>

                <p>
                  <strong>1. Player Analytics</strong>
                </p>
                <ul>
                  <li>Players by performance score distribution</li>
                  <li>Most scouted players</li>
                  <li>Position coverage analysis</li>
                  <li>Top-rated players by attributes</li>
                  <li>Player coverage statistics</li>
                </ul>

                <p>
                  <strong>2. Match & Team Analytics</strong>
                </p>
                <ul>
                  <li>Matches scouted over time</li>
                  <li>Teams and leagues coverage</li>
                  <li>Geographic distribution</li>
                  <li>Match coverage statistics</li>
                </ul>

                <p>
                  <strong>3. Scout Analytics</strong>
                </p>
                <ul>
                  <li>Scout activity metrics</li>
                  <li>Reports per scout</li>
                  <li>Scout performance comparisons</li>
                  <li>Report type distribution per scout</li>
                  <li>Timeline of scout contributions</li>
                </ul>

                <h6>Features</h6>
                <ul>
                  <li>Export data to Excel/CSV</li>
                  <li>Interactive charts and visualizations</li>
                  <li>Filterable time periods</li>
                  <li>Summary statistics cards</li>
                </ul>
              </Accordion.Body>
            </Accordion.Item>
          )}

          {/* Admin Panel - Admin Only */}
          {isAdmin && (
            <Accordion.Item eventKey="6">
              <Accordion.Header>Admin Panel</Accordion.Header>
              <Accordion.Body>
                <h6>User Management Tab</h6>
                <ul>
                  <li>Create new users with username, password, and role</li>
                  <li>
                    View all users with their roles and creation timestamps
                  </li>
                  <li>Delete users (requires confirmation)</li>
                  <li>Change user roles</li>
                </ul>

                <h6>Available Roles</h6>
                <ul>
                  <li>
                    <strong>Admin:</strong> Full access to all features and
                    reports
                  </li>
                  <li>
                    <strong>Manager:</strong> Can view all reports and access
                    analytics
                  </li>
                  <li>
                    <strong>Scout:</strong> Can only see their own reports
                  </li>
                  <li>
                    <strong>Loan:</strong> Can see their own reports and all
                    loan reports
                  </li>
                </ul>

                <h6>Data Clashes Tab</h6>
                <ul>
                  <li>Detect and resolve duplicate or conflicting data</li>
                  <li>System maintenance tools</li>
                  <li>Database integrity checks</li>
                </ul>
              </Accordion.Body>
            </Accordion.Item>
          )}

          {/* Archived Reports - All Roles */}
          <Accordion.Item eventKey="7">
            <Accordion.Header>Archived Reports</Accordion.Header>
            <Accordion.Body>
              <h6>What are Archived Reports?</h6>
              <p>
                Archived reports are historical scout reports from before the
                platform was built. They have been imported with special
                handling to preserve historical data.
              </p>

              <h6>How to Identify Archived Reports</h6>
              <ul>
                <li>
                  <strong>Card View:</strong> Gold "ARCHIVED" banner at the top
                  of the card
                </li>
                <li>
                  <strong>Table View:</strong> Bronze badge showing archived
                  status
                </li>
                <li>
                  <strong>Grade Display:</strong> Shows grade badges (A+, A, B+,
                  B, C+, C) with color coding instead of regular flag colors
                </li>
                <li>
                  <strong>VSS Scores:</strong> When available, VSS scores are
                  extracted and displayed separately
                </li>
              </ul>

              <h6>Differences from Current Reports</h6>
              <ul>
                <li>Cannot be edited or deleted (historical preservation)</li>
                <li>Different visual treatment (gold/bronze coloring)</li>
                <li>May have different data structure than current reports</li>
                <li>Marked with IS_ARCHIVED flag in the database</li>
              </ul>
            </Accordion.Body>
          </Accordion.Item>

          {/* Account Settings - All Roles */}
          <Accordion.Item eventKey="8">
            <Accordion.Header>Account Settings</Accordion.Header>
            <Accordion.Body>
              <h6>Dark Mode / Light Mode</h6>
              <p>
                Toggle between dark and light themes using the Settings dropdown
                in the navbar. Your preference is saved automatically.
              </p>

              <h6>Session Management</h6>
              <ul>
                <li>
                  <strong>Auto-Logout:</strong> You'll be automatically logged
                  out after 20 minutes of inactivity
                </li>
                <li>
                  <strong>Token Refresh:</strong> Your session automatically
                  refreshes every 15 minutes while active
                </li>
                <li>
                  <strong>Manual Logout:</strong> Use Settings → Logout to end
                  your session
                </li>
              </ul>

              <h6>Draft Saving</h6>
              <ul>
                <li>
                  Scout reports in progress are automatically saved as drafts
                </li>
                <li>Drafts are restored when you reopen the modal</li>
                <li>A draft indicator appears in the navbar when a draft exists</li>
                <li>Drafts are stored locally in your browser</li>
              </ul>

              <h6>Feedback & Support</h6>
              <ul>
                <li>Submit bugs, feature requests, or general feedback</li>
                <li>Access via "Add New" → "Submit Feedback"</li>
                <li>Set priority levels (Low, Medium, High)</li>
                <li>Track status of your feedback</li>
              </ul>
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </Modal.Body>
      <Modal.Footer>
        <small className="text-muted">
          Need more help? Contact your administrator or submit feedback.
        </small>
      </Modal.Footer>
    </Modal>

    <style>{`
      .modal-header-dark .btn-close {
        filter: invert(1) grayscale(100%) brightness(200%);
      }
    `}</style>
    </>
  );
};

export default HelpModal;
