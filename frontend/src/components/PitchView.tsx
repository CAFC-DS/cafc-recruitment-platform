import React from 'react';

interface PitchViewProps {
  positions: string[];
  className?: string;
}

const PitchView: React.FC<PitchViewProps> = ({ positions, className = '' }) => {
  // Parse position strings that might contain multiple positions separated by commas
  const parsePositions = (positionStrings: string[]): string[] => {
    const allPositions: string[] = [];
    positionStrings.forEach(posStr => {
      if (posStr) {
        // Split by comma and clean up
        const splitPositions = posStr.split(',').map(p => p.trim());
        allPositions.push(...splitPositions);
      }
    });
    // Return unique positions
    return Array.from(new Set(allPositions));
  };

  // Position coordinates (percentage of pitch width/height from top-left) - adjusted for vertical pitch
  const positionCoords: Record<string, { x: number; y: number }> = {
    // Goalkeepers
    'GOALKEEPER': { x: 50, y: 132 },
    'GK': { x: 50, y: 132 },
    
    // Defenders
    'CENTRAL_DEFENDER': { x: 50, y: 115 },
    'LEFT_WINGBACK_DEFENDER': { x: 20, y: 110 },
    'RIGHT_WINGBACK_DEFENDER': { x: 80, y: 110 },
    'RCB': { x: 65, y: 115 },
    'Defender': { x: 50, y: 115 },
    
    // Midfielders
    'DEFENSE_MIDFIELD': { x: 50, y: 95 },
    'CENTRAL_MIDFIELD': { x: 50, y: 80 },
    'ATTACKING_MIDFIELD': { x: 50, y: 50 },
    
    // Wingers
    'LEFT_WINGER': { x: 20, y: 60 },
    'RIGHT_WINGER': { x: 80, y: 60 },
    
    // Forwards
    'CENTER_FORWARD': { x: 50, y: 25 },
    'CF': { x: 50, y: 25 },
  };

  const parsedPositions = parsePositions(positions);
  const positionsWithCoords = parsedPositions
    .map(pos => ({
      position: pos,
      coords: positionCoords[pos]
    }))
    .filter(p => p.coords);

  // Group positions by their coordinates to avoid overlap
  const positionGroups = positionsWithCoords.reduce((groups, pos) => {
    const key = `${pos.coords.x}-${pos.coords.y}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(pos);
    return groups;
  }, {} as Record<string, typeof positionsWithCoords>);

  return (
    <div className={`pitch-container ${className}`} style={{ position: 'relative', width: '200px', height: '120px', margin: '0 auto' }}>
      {/* Minimalistic Pitch SVG */}
      <svg width="100%" height="100%" viewBox="0 0 100 140" style={{ 
        border: '1px solid var(--color-border, #e0e0e0)', 
        borderRadius: '6px', 
        background: 'var(--color-surface, #f8f9fa)'
      }}>
        {/* Essential pitch markings only */}
        {/* Outer boundary */}
        <rect x="2" y="2" width="96" height="136" fill="none" stroke="var(--color-border, #d0d0d0)" strokeWidth="0.4" />
        
        {/* Center line */}
        <line x1="2" y1="70" x2="98" y2="70" stroke="var(--color-border, #d0d0d0)" strokeWidth="0.3" />
        
        {/* Center circle */}
        <circle cx="50" cy="70" r="12" fill="none" stroke="var(--color-border, #d0d0d0)" strokeWidth="0.3" />
        
        {/* Penalty areas */}
        <rect x="25" y="2" width="50" height="20" fill="none" stroke="var(--color-border, #d0d0d0)" strokeWidth="0.3" />
        <rect x="25" y="118" width="50" height="20" fill="none" stroke="var(--color-border, #d0d0d0)" strokeWidth="0.3" />
        
        {/* Six-yard boxes */}
        <rect x="37.5" y="2" width="25" height="10" fill="none" stroke="var(--color-border, #d0d0d0)" strokeWidth="0.3" />
        <rect x="37.5" y="128" width="25" height="10" fill="none" stroke="var(--color-border, #d0d0d0)" strokeWidth="0.3" />
        
        {/* Goals */}
        <rect x="44" y="2" width="12" height="3" fill="none" stroke="var(--color-primary, #999)" strokeWidth="0.5" />
        <rect x="44" y="135" width="12" height="3" fill="none" stroke="var(--color-primary, #999)" strokeWidth="0.5" />
      </svg>
      
      {/* Clean position markers - no text */}
      {Object.entries(positionGroups).map(([key, group]) => {
        const baseCoords = group[0].coords;
        return group.map((pos, index) => (
          <div
            key={`${pos.position}-${index}`}
            className="position-marker"
            style={{
              position: 'absolute',
              left: `${baseCoords.x + (index * 6 - (group.length - 1) * 3)}%`,
              top: `${baseCoords.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 10
            }}
          >
            <div
              style={{
                backgroundColor: 'var(--color-primary, #dc3545)',
                borderRadius: '50%',
                width: '10px',
                height: '10px',
                border: '2px solid var(--color-surface, white)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}
              title={pos.position}
            />
          </div>
        ));
      })}
    </div>
  );
};

export default PitchView;