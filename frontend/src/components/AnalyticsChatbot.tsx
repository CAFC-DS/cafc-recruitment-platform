import React, { useState, useEffect, useRef } from 'react';
import { Card, Form, Button, Alert, Spinner, Badge, Collapse } from 'react-bootstrap';
import axiosInstance from '../axiosInstance';

interface Message {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  sql?: string;
  results?: any[];
  rowCount?: number;
  executionTime?: number;
  error?: string;
}

interface HealthStatus {
  ollama_available: boolean;
  ai_model_loaded: boolean;
  database_accessible: boolean;
  status: string;
}

interface SuggestedQuery {
  category: string;
  question: string;
  description: string;
}

const AnalyticsChatbot: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuery, setCurrentQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestedQuery[]>([]);
  const [schemaInfo, setSchemaInfo] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkHealth();
    loadSuggestions();
    loadSchemaInfo();

    // Add welcome message
    const welcomeMessage: Message = {
      id: 'welcome',
      type: 'system',
      content: `🤖 **Analytics AI Assistant**

I can help you explore recruitment data using natural language queries.

⚠️ **IMPORTANT DISCLAIMERS:**
• This is an experimental AI feature
• Results may be inaccurate or incomplete
• Always verify important insights with actual data
• Only accessible to managers and administrators

Try asking questions like:
• "Who are the top 10 highest-rated players?"
• "Which scouts have been most active this month?"
• "Show me match coverage statistics"`,
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkHealth = async () => {
    try {
      const response = await axiosInstance.get('/chatbot/health');
      setHealthStatus(response.data);
    } catch (error) {
      console.error('Health check failed:', error);
      setHealthStatus({
        ollama_available: false,
        ai_model_loaded: false,
        database_accessible: false,
        status: 'Service unavailable'
      });
    }
  };

  const loadSuggestions = async () => {
    try {
      const response = await axiosInstance.get('/chatbot/suggestions');
      setSuggestions(response.data.suggestions || []);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const loadSchemaInfo = async () => {
    try {
      const response = await axiosInstance.get('/chatbot/schema');
      setSchemaInfo(response.data.summary || '');
    } catch (error) {
      console.error('Failed to load schema info:', error);
    }
  };

  const sendQuery = async () => {
    if (!currentQuery.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: currentQuery,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentQuery('');
    setIsLoading(true);
    setShowSuggestions(false);

    try {
      // Prepare conversation history for context
      const conversationHistory = messages
        .filter(m => m.type !== 'system')
        .slice(-6) // Last 6 messages for context
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      const response = await axiosInstance.post('/chatbot/query', {
        query: currentQuery,
        conversation_history: conversationHistory
      });

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: response.data.success
          ? response.data.response || 'Query completed successfully'
          : response.data.error || 'Query failed',
        timestamp: new Date(),
        sql: response.data.sql_query,
        results: response.data.results,
        rowCount: response.data.row_count,
        executionTime: response.data.execution_time,
        error: response.data.success ? undefined : response.data.error
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch (error: any) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        type: 'ai',
        content: 'Sorry, I encountered an error processing your request. Please make sure Ollama is running and try again.',
        timestamp: new Date(),
        error: error.response?.data?.detail || error.message || 'Unknown error'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: SuggestedQuery) => {
    setCurrentQuery(suggestion.question);
    setShowSuggestions(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  };

  const getHealthStatusColor = (status: HealthStatus) => {
    if (status.ollama_available && status.ai_model_loaded && status.database_accessible) {
      return 'success';
    } else if (status.ollama_available || status.database_accessible) {
      return 'warning';
    } else {
      return 'danger';
    }
  };

  const renderResults = (message: Message) => {
    if (!message.results || message.results.length === 0) {
      return null;
    }

    const results = message.results.slice(0, 10); // Limit to first 10 rows for display

    return (
      <div className="mt-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <small className="text-muted">
            {message.rowCount} rows • {message.executionTime?.toFixed(2)}s
          </small>
          {message.sql && (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(message.sql!)}
            >
              Copy SQL
            </Button>
          )}
        </div>
        <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <table className="table table-sm table-striped">
            <thead className="table-dark">
              <tr>
                {Object.keys(results[0] || {}).map(col => (
                  <th key={col} style={{ fontSize: '0.8rem' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row, idx) => (
                <tr key={idx}>
                  {Object.values(row).map((value: any, colIdx) => (
                    <td key={colIdx} style={{ fontSize: '0.8rem' }}>
                      {value !== null && value !== undefined ? String(value) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message.rowCount! > 10 && (
          <small className="text-muted">Showing first 10 of {message.rowCount} results</small>
        )}
      </div>
    );
  };

  return (
    <Card className="shadow-sm" style={{ borderRadius: '12px', border: '2px solid #6f42c1' }}>
      <Card.Header
        style={{ backgroundColor: '#6f42c1', color: 'white', borderRadius: '12px 12px 0 0', cursor: 'pointer' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <span className="me-2">🤖</span>
            <h6 className="mb-0">Analytics AI Assistant</h6>
          </div>
          <div className="d-flex align-items-center">
            {healthStatus && (
              <Badge bg={getHealthStatusColor(healthStatus)} className="me-2">
                {healthStatus.ollama_available ? '●' : '○'}
              </Badge>
            )}
            <Button variant="link" className="text-white p-0">
              {isExpanded ? '▼' : '▶'}
            </Button>
          </div>
        </div>
      </Card.Header>

      <Collapse in={isExpanded}>
        <Card.Body style={{ maxHeight: '600px', display: 'flex', flexDirection: 'column' }}>
          {/* Health Status */}
          {healthStatus && (
            <Alert variant={getHealthStatusColor(healthStatus)} className="mb-3 py-2">
              <small>{healthStatus.status}</small>
            </Alert>
          )}

          {/* Schema Information */}
          {schemaInfo && showSuggestions && (
            <Alert variant="info" className="mb-3 py-2">
              <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
                {schemaInfo}
              </div>
            </Alert>
          )}

          {/* Suggested Queries */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="mb-3">
              <h6 className="text-muted mb-2">💡 Try these queries:</h6>
              <div className="row">
                {suggestions.map((suggestion, idx) => (
                  <div key={idx} className="col-md-6 mb-2">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="w-100 text-start"
                      style={{ fontSize: '0.8rem', whiteSpace: 'normal', height: 'auto', padding: '8px' }}
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <strong>{suggestion.category}</strong><br/>
                      {suggestion.question}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div
            className="flex-grow-1 mb-3"
            style={{
              overflowY: 'auto',
              maxHeight: '400px',
              minHeight: '200px',
              border: '1px solid #e9ecef',
              borderRadius: '8px',
              padding: '12px'
            }}
          >
            {messages.map((message) => (
              <div key={message.id} className={`mb-3 ${message.type === 'user' ? 'text-end' : ''}`}>
                <div
                  className={`d-inline-block p-3 rounded-3 ${
                    message.type === 'user'
                      ? 'bg-primary text-white'
                      : message.type === 'system'
                      ? 'bg-light text-dark border'
                      : message.error
                      ? 'bg-danger text-white'
                      : 'bg-light text-dark border'
                  }`}
                  style={{
                    maxWidth: '85%',
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.9rem'
                  }}
                >
                  {message.content}
                  {renderResults(message)}
                </div>
                <div className="mt-1">
                  <small className="text-muted">
                    {message.timestamp.toLocaleTimeString()}
                  </small>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="text-center">
                <Spinner animation="border" size="sm" className="me-2" />
                <small className="text-muted">AI is thinking...</small>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <Form onSubmit={(e) => { e.preventDefault(); sendQuery(); }}>
            <div className="d-flex">
              <Form.Control
                type="text"
                placeholder="Ask a question about the recruitment data..."
                value={currentQuery}
                onChange={(e) => setCurrentQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading || !healthStatus?.ollama_available}
                style={{ borderRadius: '20px 0 0 20px' }}
              />
              <Button
                type="submit"
                disabled={isLoading || !currentQuery.trim() || !healthStatus?.ollama_available}
                style={{ borderRadius: '0 20px 20px 0', minWidth: '80px' }}
              >
                {isLoading ? <Spinner animation="border" size="sm" /> : 'Send'}
              </Button>
            </div>
            <Form.Text className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
              ⚠️ Experimental AI feature - verify important insights with actual data
            </Form.Text>
          </Form>
        </Card.Body>
      </Collapse>
    </Card>
  );
};

export default AnalyticsChatbot;