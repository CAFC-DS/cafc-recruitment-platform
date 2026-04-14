import React from 'react';

interface NotesPreviewProps {
  notes: string;
  maxLength?: number;
}

const NotesPreview: React.FC<NotesPreviewProps> = ({ notes, maxLength = 80 }) => {
  if (!notes || notes.trim() === '') {
    return <span className="text-muted fst-italic">No notes</span>;
  }

  const truncated = notes.length > maxLength ? notes.substring(0, maxLength) + '...' : notes;
  const hasMore = notes.length > maxLength;

  return (
    <div className="notes-preview">
      {hasMore ? (
        <span
          className="text-truncate d-inline-block"
          style={{ maxWidth: '300px', cursor: 'help' }}
          title={notes}
          data-bs-toggle="tooltip"
          data-bs-placement="top"
        >
          {truncated}
        </span>
      ) : (
        <span>{truncated}</span>
      )}
      {hasMore && (
        <i className="bi bi-info-circle ms-1 text-muted" style={{ fontSize: '0.8rem' }}></i>
      )}
    </div>
  );
};

export default NotesPreview;
