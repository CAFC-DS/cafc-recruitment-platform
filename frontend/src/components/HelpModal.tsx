import React from "react";
import { Accordion, Modal } from "react-bootstrap";
import "./HelpModal.css";

interface HelpModalProps {
  show: boolean;
  onHide: () => void;
  userRole: string;
}

const HelpModal: React.FC<HelpModalProps> = ({ show, onHide, userRole }) => {
  const normalisedRole = userRole || "scout";
  const isAdmin = normalisedRole === "admin";
  const isSeniorManager = normalisedRole === "senior_manager";
  const isManager = normalisedRole === "manager";
  const isLoanManager =
    normalisedRole === "loan_manager" || normalisedRole === "loan";
  const isScout = normalisedRole === "scout";

  const canAccessIntel = isAdmin || isSeniorManager;
  const canAccessAnalytics = isAdmin || isSeniorManager || isManager;
  const canAccessLists = isAdmin || isSeniorManager;
  const canAddData = isAdmin || isSeniorManager || isManager;

  const roleLabelMap: Record<string, string> = {
    admin: "Admin",
    senior_manager: "Senior Manager",
    manager: "Manager",
    loan_manager: "Loan Manager",
    loan: "Loan Manager",
    scout: "Scout",
    agent: "Agent",
  };

  const roleLabel = roleLabelMap[normalisedRole] || normalisedRole;

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
          <div className="mb-3">
            <p className="mb-2">
              You are signed in as <strong>{roleLabel}</strong>.
            </p>
            <p className="mb-0">
              This guide only shows the parts of the platform that apply to
              your role.
            </p>
          </div>

          <Accordion alwaysOpen={false}>
            <Accordion.Item eventKey="0">
              <Accordion.Header>Your Access</Accordion.Header>
              <Accordion.Body>
                {isAdmin && (
                  <>
                    <p>
                      You have full access to the internal platform, including
                      scouting, intel, lists, analytics, recommendations, and
                      user management.
                    </p>
                    <ul>
                      <li>Use Home to monitor recent activity across the platform.</li>
                      <li>Use Scouting to review, edit, and manage reports.</li>
                      <li>Use Intel to capture transfer and contract information.</li>
                      <li>Use Lists to manage internal lists and external recommendations.</li>
                      <li>Use Analytics for reporting and coverage trends.</li>
                      <li>Use Admin to manage users and data maintenance tools.</li>
                    </ul>
                  </>
                )}

                {isSeniorManager && (
                  <>
                    <p>
                      You can work across the main recruitment tools, including
                      intel, lists, analytics, and recommendations.
                    </p>
                    <ul>
                      <li>Use Home for recent reports and quick oversight.</li>
                      <li>Use Scouting to review reports and player history.</li>
                      <li>Use Intel for market information and action tracking.</li>
                      <li>Use Lists to manage the internal pipeline and external submissions.</li>
                      <li>Use Analytics to review activity and coverage.</li>
                    </ul>
                  </>
                )}

                {isManager && (
                  <>
                    <p>
                      You can review scouting work, create data entries from the
                      navbar, and use analytics for day-to-day oversight.
                    </p>
                    <ul>
                      <li>Use Home for recent reports and top themes.</li>
                      <li>Use Scouting to filter, review, and share reports.</li>
                      <li>Use Analytics to track output and coverage.</li>
                      <li>
                        Use the <strong>Add New</strong> menu to add reports,
                        players, fixtures, and intel.
                      </li>
                    </ul>
                  </>
                )}

                {isLoanManager && (
                  <>
                    <p>
                      Your role is focused on scouting activity, with added
                      visibility across loan-related reports.
                    </p>
                    <ul>
                      <li>Use Home to keep an eye on recent scouting activity.</li>
                      <li>Use Scouting to review your own reports and loan reports.</li>
                      <li>Use player profiles to see report history and notes.</li>
                      <li>Use the queue when entering several reports from one match.</li>
                    </ul>
                  </>
                )}

                {isScout && (
                  <>
                    <p>
                      Your role is centred on report writing, player review, and
                      keeping your work organised.
                    </p>
                    <ul>
                      <li>Use Home to see recent reports and quick summaries.</li>
                      <li>Use Scouting to create, edit, and filter your reports.</li>
                      <li>Use player profiles to check history, notes, and previous views.</li>
                      <li>Use drafts and the queue to speed up match-day entry.</li>
                    </ul>
                  </>
                )}
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="1">
              <Accordion.Header>Navigation & Everyday Use</Accordion.Header>
              <Accordion.Body>
                <h6>Main Pages</h6>
                <ul>
                  <li>
                    <strong>Home:</strong> Recent reports, flags, top players,
                    and a quick view of current activity.
                  </li>
                  <li>
                    <strong>Scouting:</strong> The main report list, with
                    filters, search, editing, and sharing.
                  </li>
                  {canAccessIntel && (
                    <li>
                      <strong>Intel:</strong> Market and contract information,
                      with filtering and action tracking.
                    </li>
                  )}
                  {canAccessLists && (
                    <li>
                      <strong>Lists:</strong> Entry point for Internal Lists and
                      External Recommendations.
                    </li>
                  )}
                  {canAccessAnalytics && (
                    <li>
                      <strong>Analytics:</strong> Reporting on players, scouts,
                      teams, and coverage.
                    </li>
                  )}
                  {isAdmin && (
                    <li>
                      <strong>Admin:</strong> User management and maintenance
                      tools.
                    </li>
                  )}
                </ul>

                <h6>Navbar Tools</h6>
                <ul>
                  <li>
                    <strong>Player Search:</strong> Start typing in the top
                    search box to jump straight to a player profile.
                  </li>
                  <li>
                    <strong>Add New:</strong> Every internal user can add an
                    assessment and submit feedback.
                  </li>
                  {canAddData && (
                    <li>
                      Managers, senior managers, and admins can also add intel,
                      fixtures, and players from the same menu.
                    </li>
                  )}
                  <li>
                    <strong>In Progress:</strong> Shows saved drafts and queued
                    reports when you have them.
                  </li>
                  <li>
                    <strong>Settings:</strong> Light or dark mode, help, and
                    logout.
                  </li>
                </ul>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="2">
              <Accordion.Header>Scouting & Report Writing</Accordion.Header>
              <Accordion.Body>
                <h6>Report Types</h6>
                <ul>
                  <li>
                    <strong>Player Assessment:</strong> Full match-based report
                    with scores, attributes, summary, strengths, and weaknesses.
                  </li>
                  <li>
                    <strong>Flag:</strong> Shorter workflow for marking a player
                    quickly as a positive or cautionary view.
                  </li>
                  <li>
                    <strong>Clips:</strong> A lighter report for video-based
                    review or shorter notes.
                  </li>
                </ul>

                <h6>Creating a Report</h6>
                <ol>
                  <li>Open <strong>Add New</strong> and choose <strong>Add Assessment</strong>.</li>
                  <li>Select the report type.</li>
                  <li>Search for the player and choose the correct record.</li>
                  <li>Select the fixture when the report type needs match context.</li>
                  <li>Complete the required fields and written summary.</li>
                  <li>Choose <strong>Submit</strong> or <strong>Add to Queue</strong>.</li>
                </ol>

                <h6>Drafts & Queue</h6>
                <ul>
                  <li>Drafts are saved locally in your browser while you work.</li>
                  <li>
                    The queue is useful when you are entering several reports
                    from the same fixture.
                  </li>
                  <li>
                    Queued reports keep the fixture context so you can move
                    through players more quickly.
                  </li>
                  <li>
                    Failed queued submissions stay in the queue so you can try
                    again later.
                  </li>
                </ul>

                <h6>Editing & Visibility</h6>
                <ul>
                  <li>You can edit or delete the reports you created.</li>
                  <li>
                    Use the filters on the Scouting page to narrow by player,
                    scout, report type, scouting type, fixture, date, and age.
                  </li>
                  {isLoanManager && (
                    <li>
                      As a loan manager, you can also review reports with a loan
                      assessment purpose.
                    </li>
                  )}
                </ul>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="3">
              <Accordion.Header>Player Search, Profiles & Notes</Accordion.Header>
              <Accordion.Body>
                <h6>Finding Players</h6>
                <ul>
                  <li>Use the global search in the navbar from anywhere in the platform.</li>
                  <li>Results appear as you type and open the player profile directly.</li>
                  <li>The search is forgiving on names and is useful for quick checks mid-workflow.</li>
                </ul>

                <h6>What a Player Profile Shows</h6>
                <ul>
                  <li>Basic details such as name, age, club, and position.</li>
                  <li>Report history, including archived historical material where available.</li>
                  <li>Charts and trends built from report data.</li>
                  <li>Intel and notes when those exist for the player.</li>
                </ul>

                <h6>Notes</h6>
                <ul>
                  <li>Private notes are visible only to you.</li>
                  <li>Shared notes are visible to the wider internal team.</li>
                  <li>Notes are timestamped so you can follow the latest thinking.</li>
                </ul>
              </Accordion.Body>
            </Accordion.Item>

            {canAccessIntel && (
              <Accordion.Item eventKey="4">
                <Accordion.Header>Intel</Accordion.Header>
                <Accordion.Body>
                  <h6>What Intel Is For</h6>
                  <p>
                    The Intel page is for transfer, contract, and market
                    information that sits alongside scouting opinion.
                  </p>

                  <h6>Typical Use</h6>
                  <ul>
                    <li>Create intel from <strong>Add New</strong> when new information comes in.</li>
                    <li>Filter by player, contact, date, or action required.</li>
                    <li>Use player profiles to view intel in context with reports.</li>
                    <li>Mark important items clearly so follow-up work is easier to spot.</li>
                  </ul>
                </Accordion.Body>
              </Accordion.Item>
            )}

            {canAccessLists && (
              <Accordion.Item eventKey="5">
                <Accordion.Header>Lists & Recommendations</Accordion.Header>
                <Accordion.Body>
                  <h6>Lists Workspace</h6>
                  <ul>
                    <li>
                      <strong>Internal Lists</strong> are for managing the
                      recruitment pipeline by stage.
                    </li>
                    <li>
                      <strong>External Recommendations</strong> are for
                      reviewing agent submissions in a flat table.
                    </li>
                  </ul>

                  <h6>Internal Lists</h6>
                  <ul>
                    <li>Create and rename lists from the main list page.</li>
                    <li>Add players, move them through stages, and archive them when needed.</li>
                    <li>Use advanced filters to narrow by stage, age, position, club, score, and report count.</li>
                    <li>Switch to Kanban view when you want a board-style workflow.</li>
                    <li>Save stage and removal changes from the sticky save bar at the bottom.</li>
                    <li>Open stage history to see how a player has moved through the list.</li>
                  </ul>

                  <h6>External Recommendations</h6>
                  <ul>
                    <li>Filter by player, agent, deal type, dates, fee, and expected salary.</li>
                    <li>Open the row detail to review the full submission.</li>
                    <li>Use the status field to update the review outcome.</li>
                    <li>Use history to see how the review status has changed over time.</li>
                  </ul>
                </Accordion.Body>
              </Accordion.Item>
            )}

            {canAccessAnalytics && (
              <Accordion.Item eventKey="6">
                <Accordion.Header>Analytics</Accordion.Header>
                <Accordion.Body>
                  <h6>What You Can Review</h6>
                  <ul>
                    <li>Player trends and score distribution.</li>
                    <li>Match, team, and league coverage.</li>
                    <li>Scout activity and output over time.</li>
                  </ul>

                  <h6>Good Uses</h6>
                  <ul>
                    <li>Check whether coverage is balanced across leagues and positions.</li>
                    <li>Spot players attracting repeated positive reports.</li>
                    <li>Review reporting volume and timing across the team.</li>
                    <li>Export data when you need to take it elsewhere.</li>
                  </ul>
                </Accordion.Body>
              </Accordion.Item>
            )}

            {isAdmin && (
              <Accordion.Item eventKey="7">
                <Accordion.Header>Admin</Accordion.Header>
                <Accordion.Body>
                  <h6>User Management</h6>
                  <ul>
                    <li>Create users and assign the correct role.</li>
                    <li>Change roles when responsibilities change.</li>
                    <li>Reset or remove access when needed.</li>
                  </ul>

                  <h6>Operational Notes</h6>
                  <ul>
                    <li>Prefer removing access rather than deleting records where history matters.</li>
                    <li>Be careful with role changes, as they alter what users can see immediately.</li>
                    <li>Use the admin tools for maintenance and data housekeeping only when needed.</li>
                  </ul>
                </Accordion.Body>
              </Accordion.Item>
            )}

            <Accordion.Item eventKey="8">
              <Accordion.Header>Account, Feedback & Support</Accordion.Header>
              <Accordion.Body>
                <h6>Session & Appearance</h6>
                <ul>
                  <li>Your session logs out after inactivity, so save work if stepping away.</li>
                  <li>The platform refreshes your token while you are active.</li>
                  <li>Theme choice is saved when you switch between light and dark mode.</li>
                </ul>

                <h6>Feedback</h6>
                <ul>
                  <li>Use <strong>Add New</strong> → <strong>Send Feedback</strong> for bugs, requests, or comments.</li>
                  <li>Add enough detail for the team to reproduce the issue quickly.</li>
                </ul>

                <h6>If Something Looks Wrong</h6>
                <ul>
                  <li>Refresh first if a page looks out of date.</li>
                  <li>Check whether filters are hiding the record you expect to see.</li>
                  <li>Use feedback or contact an administrator if the issue continues.</li>
                </ul>
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
        <Modal.Footer>
          <small className="text-muted">
            Need more help? Submit feedback in the platform or speak to an
            administrator.
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
