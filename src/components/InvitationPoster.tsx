import React, { forwardRef } from 'react';
import { Guest, Meeting } from '../types';
import { format } from 'date-fns';

interface InvitationPosterProps {
  guest: Guest | null;
  meeting: Meeting | null;
}

const InvitationPoster = forwardRef<HTMLDivElement, InvitationPosterProps>(({ guest, meeting }, ref) => {
  if (!guest || !meeting) return null;

  const meetingDate = meeting.date?.toDate ? meeting.date.toDate() : new Date(meeting.date);
  const formattedDate = format(meetingDate, 'dd/MM/yyyy');
  // Get day of week in Vietnamese
  const daysOfWeek = ['CHỦ NHẬT', 'THỨ 2', 'THỨ 3', 'THỨ 4', 'THỨ 5', 'THỨ 6', 'THỨ 7'];
  const dayOfWeek = daysOfWeek[meetingDate.getDay()];

  return (
    <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
      <div 
        ref={ref}
        style={{
          width: '800px',
          height: '1131px',
          background: 'url("/poster-template.jpg") center/cover no-repeat, linear-gradient(135deg, #e67e22, #d35400)',
          position: 'relative',
          fontFamily: 'Montserrat, sans-serif',
          color: 'white',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}
      >
        {/* Guest Name */}
        <div style={{
          position: 'absolute',
          top: '60%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          textAlign: 'center',
          fontSize: '36px',
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          textShadow: '0px 2px 4px rgba(0,0,0,0.5)'
        }}>
          {guest.name}
        </div>

        {/* Guest Company */}
        <div style={{
          position: 'absolute',
          top: '66%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          textAlign: 'center',
          fontSize: '28px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          textShadow: '0px 2px 4px rgba(0,0,0,0.5)'
        }}>
          {guest.company}
        </div>

        {/* Date */}
        <div style={{
          position: 'absolute',
          top: '81%',
          left: '68%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'left',
        }}>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#6a3617' }}>{dayOfWeek}</div>
          <div style={{ fontSize: '32px', fontWeight: '900', color: '#e67e22', marginTop: '-5px' }}>{formattedDate}</div>
        </div>

        {/* Location Name */}
        <div style={{
          position: 'absolute',
          top: '89.5%',
          left: '26%',
          transform: 'translate(-50%, -50%)',
          width: '40%',
          textAlign: 'center',
          fontSize: '20px',
          fontWeight: '900',
          textTransform: 'uppercase',
        }}>
          {meeting.location.split(',')[0]}
        </div>

        {/* Location Address */}
        <div style={{
          position: 'absolute',
          top: '89.5%',
          left: '73%',
          transform: 'translate(-50%, -50%)',
          width: '45%',
          textAlign: 'center',
          fontSize: '16px',
          fontWeight: '700',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {meeting.location}
        </div>
      </div>
    </div>
  );
});

InvitationPoster.displayName = 'InvitationPoster';

export default InvitationPoster;
