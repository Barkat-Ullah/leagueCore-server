// Generate Otp
const generateOtpEmail = (otp: number) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
        
        <div style="background: #0d47a1; padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">
            Verification Code
          </h1>
        </div>
        
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0; text-align: center;">
            Your OTP code is below.
          </p>
          
          <div style="background-color: #f1f5f9; padding: 30px; border-radius: 6px; margin: 0 0 25px 0; text-align: center; border-left: 4px solid #0d47a1;">
            <p style="font-size: 14px; color: #4a5568; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">
              Your OTP Code
            </p>
            <p style="font-size: 42px; font-weight: 700; color: #0d47a1; margin: 0; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${otp}
            </p>
          </div>
          
          <div style="text-align: center; margin-bottom: 20px;">
            <p style="font-size: 14px; color: #4a5568; margin-bottom: 10px;">
              This OTP will expire in <strong style="color: #0d47a1;">10 minutes</strong>.
            </p>
            <p style="font-size: 14px; color: #4a5568; margin-bottom: 10px;">
              If you did not request this, please ignore the email.
            </p>
          </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 14px; color: #555; margin: 0 0 8px 0;">
            Best Regards,
          </p>
          <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 0 0 20px 0;">
            Crown & Pitch
          </p>
          <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
            © ${new Date().getFullYear()} All rights reserved.
          </p>
        </div>
        
      </div>
    </div>`;
};

//Forgot Password
const forgetPasswordEmail = (otp: number) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
        
        <div style="background: #0d47a1; padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">
            Forgot Password Code
          </h1>
        </div>
        
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0; text-align: center;">
            Use the OTP below to reset your password.
          </p>
          
          <div style="background-color: #f1f5f9; padding: 30px; border-radius: 6px; margin: 0 0 25px 0; text-align: center; border-left: 4px solid #0d47a1;">
            <p style="font-size: 14px; color: #4a5568; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">
              Your OTP Code
            </p>
            <p style="font-size: 42px; font-weight: 700; color: #0d47a1; margin: 0; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${otp}
            </p>
          </div>
          
          <div style="text-align: center; margin-bottom: 20px;">
            <p style="font-size: 14px; color: #4a5568; margin-bottom: 10px;">
              The OTP expires in <strong style="color: #0d47a1;">10 minutes</strong>.
            </p>
          </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 14px; color: #555; margin: 0 0 8px 0;">
            Best Regards,
          </p>
          <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 0 0 20px 0;">
            Crown & Pitch
          </p>
          <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
            © ${new Date().getFullYear()} All rights reserved.
          </p>
        </div>
        
      </div>
    </div>`;
};

// Resend Otp
const resendOtpEmail = (otp: number) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
        
        <div style="background: #0d47a1; padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0;">
            Resent Verification Code
          </h1>
        </div>
        
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; text-align: center;">
            Your new OTP is below.
          </p>
          
          <div style="background-color: #f1f5f9; padding: 30px; border-radius: 6px; margin: 20px 0; text-align: center; border-left: 4px solid #0d47a1;">
            <p style="font-size: 42px; font-weight: 700; color: #0d47a1; margin: 0; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${otp}
            </p>
          </div>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 14px; color: #555; margin: 0 0 8px 0;">
            Best Regards,
          </p>
          <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 0 0 20px 0;">
            Crown & Pitch
          </p>
          <p style="font-size: 12px; color: #777; line-height: 1.6; margin: 0;">
            © ${new Date().getFullYear()} All rights reserved.
          </p>
        </div>
        
      </div>
    </div>`;
};

// Invite User Email (after admin adds a user)
const inviteUserEmail = (fullName: string, password: string) => {
  return `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f9; padding: 40px;">
    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">

      <h2 style="color: #0d47a1; font-size: 26px; text-align: center; margin-bottom: 10px; letter-spacing: 0.5px;">
        Welcome to the Team!
      </h2>

      <p style="font-size: 15px; color: #555; text-align: center; margin-top: 0; line-height: 1.7;">
        Hello <strong style="color:#0d47a1;">${fullName}</strong>,  
        <br/><br/>
        You have been added to the team as a Manager/Player.
        You may now log in using the credentials provided below.
      </p>

      <div style="background: #f1f5f9; border-left: 4px solid #0d47a1; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 0 0 15px 0;">
          Your Login Credentials:
        </p>

        <p style="font-size: 14px; color: #4a5568; margin: 6px 0;">
          <strong>Username:</strong> ${fullName}
        </p>

        <p style="font-size: 14px; color: #4a5568; margin: 6px 0;">
          <strong>Password:</strong> ${password}
        </p>
      </div>

      <p style="font-size: 14px; color: #555; line-height: 1.7; margin-top: 20px; text-align:center;">
        If you need assistance accessing your account,  
        please contact our support team anytime.
      </p>

      <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />

      <div style="text-align: center; margin-top: 10px;">
        <p style="font-size: 13px; color: #777;">
          Regards,<br/>
          <span style="font-weight: bold; color: #0d47a1;">Crown & Pitch</span>
        </p>
      </div>

    </div>
  </div>
  `;
};

// Support Message
const generateSupportMessageEmail = ({
  email,
  name,
  phone,
  message,
}: {
  email: string;
  name: string;
  phone: string;
  message: string;
}) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">

        <!-- Header -->
        <div style="background: #0d47a1; padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">
            New Support Message
          </h1>
        </div>

        <!-- Content -->
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin-bottom: 30px;">
            You have received a new support message from a user. The details are below:
          </p>

          <!-- User Info -->
          <div style="background-color: #f1f5f9; padding: 25px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #0d47a1;">
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #4a5568;">
              <strong style="color: #0d47a1;">Name:</strong> ${name}
            </p>
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #4a5568;">
              <strong style="color: #0d47a1;">Phone:</strong> ${phone}
            </p>
            <p style="margin: 0; font-size: 14px; color: #4a5568;">
              <strong style="color: #0d47a1;">Email:</strong> ${email}
            </p>
          </div>

          <!-- Message -->
          <div style="background-color: #ffffff; padding: 25px; border-radius: 6px; border: 1px solid #e9ecef;">
            <p style="font-size: 14px; color: #4a5568; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">
              Message
            </p>
            <p style="font-size: 15px; color: #333; line-height: 1.7; margin: 0; white-space: pre-line;">
              ${message}
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 14px; color: #555; margin: 0 0 8px 0;">
            Admin Notification
          </p>
          <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 0 0 20px 0;">
            Support System
          </p>
          <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
            © ${new Date().getFullYear()} Crown & Pitch. All rights reserved.
          </p>
        </div>

      </div>
    </div>
  `;
};

const waiverReminderEmailHtml = (fullName: string) => {
  return `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f9; padding: 40px;">
    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">

      <h2 style="color: #0d47a1; font-size: 26px; text-align: center; margin-bottom: 10px; letter-spacing: 0.5px;">
        Waiver Signing Reminder
      </h2>

      <p style="font-size: 15px; color: #555; text-align: center; margin-top: 0; line-height: 1.7;">
        Hello <strong style="color:#0d47a1;">${fullName}</strong>,
        <br/><br/>
        This is a reminder that your <strong>waiver agreement</strong> has not been completed yet.
        Please log in to your account and complete the signing at your earliest convenience
        to remain eligible for upcoming matches.
      </p>

      <div style="background: #fff8e1; border-left: 4px solid #f6ad55; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <p style="font-size: 14px; color: #744210; margin: 0; line-height: 1.7;">
          ⚠️ Failure to complete your waiver signing may affect your eligibility and
          roster status. If you have already signed, please disregard this message.
        </p>
      </div>

      <p style="font-size: 14px; color: #555; line-height: 1.7; margin-top: 20px; text-align: center;">
        If you need assistance, please contact our support team anytime.
      </p>

      <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />

      <div style="text-align: center; margin-top: 10px;">
        <p style="font-size: 13px; color: #777;">
          Regards,<br/>
          <span style="font-weight: bold; color: #0d47a1;">Crown & Pitch</span>
        </p>
      </div>

    </div>
  </div>
  `;
};

// Team Invitation Email (to Coach + Managers) — NO accept/decline links
const teamInvitationEmailHtml = ({
  coachName,
  teamName,
  tournamentName,
  divisionName,
  startDate,
  endDate,
  location,
  registrationDeadline,
}: {
  coachName: string;
  teamName: string;
  tournamentName: string;
  divisionName: string;
  startDate: string; // pre-formatted string
  endDate: string; // pre-formatted string
  location: string;
  registrationDeadline?: string; // pre-formatted string
}) => {
  return `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
    <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);">

      <!-- Header -->
      <div style="background: #0d47a1; padding: 38px 28px; text-align: center;">
        <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: 0.4px;">
          Team Invitation
        </h1>
        <p style="color: #e3f2fd; margin: 10px 0 0 0; font-size: 14px; line-height: 1.6;">
          ${tournamentName} • ${divisionName}
        </p>
      </div>

      <!-- Body -->
      <div style="padding: 36px 28px;">
        <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 18px 0;">
          Hello <strong style="color:#0d47a1;">${coachName}</strong>,
        </p>

        <p style="font-size: 15px; color: #4a5568; line-height: 1.7; margin: 0 0 22px 0;">
          Your team <strong style="color:#0d47a1;">${teamName}</strong> has been invited to participate in
          <strong style="color:#0d47a1;">${tournamentName}</strong> under the
          <strong style="color:#0d47a1;">${divisionName}</strong> division.
        </p>

        <!-- Tournament Details -->
        <div style="background-color: #f1f5f9; border-left: 4px solid #0d47a1; padding: 18px; border-radius: 6px; margin: 0 0 22px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #4a5568;">
            <strong style="color:#0d47a1;">Tournament:</strong> ${tournamentName}
          </p>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #4a5568;">
            <strong style="color:#0d47a1;">Division:</strong> ${divisionName}
          </p>
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #4a5568;">
            <strong style="color:#0d47a1;">Dates:</strong> ${startDate} - ${endDate}
          </p>
          <p style="margin: 0; font-size: 14px; color: #4a5568;">
            <strong style="color:#0d47a1;">Location:</strong> ${location}
          </p>
          ${registrationDeadline
      ? `
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #4a5568;">
            <strong style="color:#0d47a1;">Registration Deadline:</strong> ${registrationDeadline}
          </p>`
      : ``
    }
        </div>

        <!-- Note -->
        <div style="background: #fff8e1; border-left: 4px solid #f6ad55; padding: 16px 18px; border-radius: 6px;">
          <p style="font-size: 13px; color: #744210; margin: 0; line-height: 1.7;">
            ⚠️ Please log in to your account to respond to this invitation before the registration deadline.
          </p>
        </div>

        <div style="margin-top: 18px; text-align: center;">
          <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6;">
            This message was sent to the team's coach and managers for visibility.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f1f5f9; padding: 28px; text-align: center; border-top: 1px solid #e9ecef;">
        <p style="font-size: 13px; color: #555; margin: 0 0 8px 0;">Best Regards,</p>
        <p style="font-size: 14px; color: #0d47a1; font-weight: 700; margin: 0 0 14px 0;">Crown & Pitch</p>
        <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
          © ${new Date().getFullYear()} All rights reserved.
        </p>
      </div>

    </div>
  </div>
  `;
};

// Waitlist Offer Email
const waitlistOfferEmail = ({
  parentName,
  sessionTime,
  amount,
  offerExpiresAt,
  confirmLink,
}: {
  parentName: string;
  sessionTime: string;
  amount: number;
  offerExpiresAt: string;
  confirmLink: string;
}) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
        
        <div style="background: linear-gradient(135deg, #0d47a1 0%, #1565c0 100%); padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">
            ⭐ Great News! A Spot Opened Up
          </h1>
          <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 10px 0 0 0;">
            Camp Registration Offer
          </p>
        </div>
        
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Hi <strong style="color: #0d47a1;">${parentName}</strong>,
            <br/><br/>
            We're excited to offer your family a spot in our upcoming Crown &amp; Pitch Proving Camp!
          </p>
          
          <div style="background-color: #f0f7ff; padding: 25px; border-radius: 6px; margin: 0 0 25px 0; border-left: 4px solid #0d47a1;">
            <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 0 0 15px 0;">
              📅 Session Details
            </p>
            
            <div style="font-size: 14px; color: #4a5568; line-height: 2;">
              <p style="margin: 0;"><strong>Session Time:</strong> ${sessionTime}</p>
            </div>
          </div>

          <div style="background-color: #fff4e6; padding: 24px; border-radius: 6px; margin: 0 0 25px 0; border: 1px solid #ffe0b2;">
            <p style="font-size: 15px; color: #e65100; font-weight: 600; margin: 0 0 12px 0;">
              ⏰ Limited Time Offer
            </p>
            <p style="font-size: 14px; color: #d84315; margin: 0; line-height: 1.6;">
              You have until <strong>${offerExpiresAt}</strong> to confirm your spot. If you don't respond, we'll offer the spot to the next family on our waitlist.
            </p>
          </div>

          <div style="background-color: #f1f5f9; padding: 20px; border-radius: 6px; margin: 0 0 30px 0; text-align: center;">
            <p style="font-size: 13px; color: #4a5568; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">
              Registration Fee
            </p>
            <p style="font-size: 28px; font-weight: 700; color: #0d47a1; margin: 0;">
              $${amount.toFixed(2)}
            </p>
            <p style="font-size: 12px; color: #757575; margin: 8px 0 0 0;">
              Includes all camp activities &amp; materials
            </p>
          </div>

          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${confirmLink}" style="display: inline-block; background: linear-gradient(135deg, #0d47a1 0%, #1565c0 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(13, 71, 161, 0.3);">
              Confirm &amp; Proceed to Payment
            </a>
          </div>

          <p style="font-size: 13px; color: #757575; line-height: 1.7; text-align: center; margin: 20px 0 0 0;">
            Can't make it? No problem! Just let us know and we'll keep your name on our waitlist for future sessions.
          </p>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 13px; color: #4a5568; margin: 0 0 12px 0; line-height: 1.8;">
            Questions? Contact us anytime<br/>
            <strong style="color: #0d47a1;">Email:</strong> support@crownandpitch.com
          </p>
          <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 15px 0;" />
          <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
            © ${new Date().getFullYear()} Crown & Pitch. All rights reserved.
          </p>
        </div>
        
      </div>
    </div>`;
};

// Camp Registration Confirmation
const campRegistrationConfirmationEmail = (
  parentName: string,
  players: Array<{ playerName: string; playerType: string }>,
  numberOfWeeks: number,
  totalAmount: number
) => {
  const playerRows = players
    .map(
      (p) =>
        `<li><strong>${p.playerName}</strong> — ${p.playerType === "GOALIE" ? "Goalie" : "Field Player"}</li>`
    )
    .join("");

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
        
        <div style="background: #0d47a1; padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">
            Camp Registration Confirmed
          </h1>
        </div>
        
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Dear ${parentName},
          </p>
          
          <p style="font-size: 15px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Thank you for registering for our Crown &amp; Pitch Proving Camp! We're excited to have your player(s) join us.
          </p>
          
          <div style="background-color: #f1f5f9; padding: 25px; border-radius: 6px; margin: 0 0 25px 0; border-left: 4px solid #0d47a1;">
            <h3 style="color: #0d47a1; margin: 0 0 15px 0; font-size: 16px;">Registration Details:</h3>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 15px; color: #4a5568; line-height: 2;">
              <li><strong>Parent Name:</strong> ${parentName}</li>
              <li><strong>Session:</strong> 9:00 AM - 12:00 PM, 3 days per week</li>
              <li><strong>Number of Weeks:</strong> ${numberOfWeeks}</li>
            </ul>
            <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 15px 0 8px 0;">Players:</p>
            <ul style="padding-left: 20px; margin: 0; font-size: 15px; color: #4a5568; line-height: 2;">
              ${playerRows}
            </ul>
          </div>
          
          <div style="background-color: #e8f5e9; padding: 25px; border-radius: 6px; margin: 0 0 25px 0; border-left: 4px solid #4caf50;">
            <h3 style="color: #2e7d32; margin: 0 0 10px 0; font-size: 16px;">Payment Pending:</h3>
            <p style="font-size: 24px; color: #2e7d32; font-weight: 700; margin: 0 0 8px 0;">$${totalAmount.toFixed(2)}</p>
            <p style="font-size: 14px; color: #4a5568; margin: 0;">Please complete your payment to confirm your spot.</p>
          </div>
          
          <p style="font-size: 14px; color: #4a5568; line-height: 1.7; margin: 0;">
            If you have any questions or need assistance, please don't hesitate to contact us.
          </p>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 14px; color: #555; margin: 0 0 8px 0;">
            Best Regards,
          </p>
          <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 0 0 20px 0;">
            Crown &amp; Pitch Team
          </p>
          <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
            © ${new Date().getFullYear()} Crown &amp; Pitch. All rights reserved.
          </p>
        </div>
        
      </div>
    </div>`;
};

// Camp Payment Confirmed
const campPaymentConfirmedEmail = (
  parentName: string,
  players: Array<{ playerName: string; playerType: string }>,
  numberOfWeeks: number,
  totalAmount: number
) => {
  const playerRows = players
    .map(
      (p) =>
        `<li><strong>${p.playerName}</strong> — ${p.playerType === "GOALIE" ? "Goalie" : "Field Player"}</li>`
    )
    .join("");

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
        
        <div style="background: #1976d2; padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">
            Payment Confirmed ✓
          </h1>
        </div>
        
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Dear ${parentName},
          </p>
          
          <p style="font-size: 15px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Great news! Your payment for the Crown &amp; Pitch Proving Camp has been received and confirmed.
          </p>
          
          <div style="background-color: #e8f5e9; padding: 25px; border-radius: 6px; margin: 0 0 25px 0; border-left: 4px solid #4caf50;">
            <h3 style="color: #2e7d32; margin: 0 0 15px 0; font-size: 16px;">Registration Confirmed:</h3>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 15px; color: #4a5568; line-height: 2;">
              <li><strong>Parent Name:</strong> ${parentName}</li>
              <li><strong>Session:</strong> 9:00 AM - 12:00 PM, 3 days per week</li>
              <li><strong>Number of Weeks:</strong> ${numberOfWeeks}</li>
              <li><strong>Amount Paid:</strong> $${totalAmount.toFixed(2)}</li>
            </ul>
            <p style="font-size: 15px; color: #0d47a1; font-weight: 600; margin: 15px 0 8px 0;">Players:</p>
            <ul style="padding-left: 20px; margin: 0; font-size: 15px; color: #4a5568; line-height: 2;">
              ${playerRows}
            </ul>
          </div>
          
          <p style="font-size: 15px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Your spot is now confirmed! We look forward to seeing your player(s) at camp. If you have any questions, please feel free to contact us.
          </p>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 14px; color: #555; margin: 0 0 8px 0;">
            Best Regards,
          </p>
          <p style="font-size: 15px; color: #1976d2; font-weight: 600; margin: 0 0 20px 0;">
            Crown &amp; Pitch Team
          </p>
          <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
            © ${new Date().getFullYear()} Crown &amp; Pitch. All rights reserved.
          </p>
        </div>
        
      </div>
    </div>`;
};

// Camp Payment Failed
const campPaymentFailedEmail = (
  parentName: string,
  errorMessage: string,
  retryLink: string
) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
        
        <div style="background: #d32f2f; padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">
            Payment Failed
          </h1>
        </div>
        
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Dear ${parentName},
          </p>
          
          <p style="font-size: 15px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Unfortunately, we were unable to process your payment for the Crown &amp; Pitch Proving Camp registration.
          </p>
          
          <div style="background-color: #ffebee; padding: 25px; border-radius: 6px; margin: 0 0 25px 0; border-left: 4px solid #d32f2f;">
            <h3 style="color: #b71c1c; margin: 0 0 10px 0; font-size: 16px;">Error Details:</h3>
            <p style="font-size: 14px; color: #4a5568; margin: 0;">
              <strong>Reason:</strong> ${errorMessage}
            </p>
          </div>
          
          <p style="font-size: 15px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Please try again with a valid payment method. You can use your debit/credit card.
          </p>
          
          <div style="text-align: center; margin: 0 0 25px 0;">
            <a href="${retryLink}" style="background-color: #d32f2f; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: 600; display: inline-block; font-size: 16px;">
              Retry Payment
            </a>
          </div>
          
          <p style="font-size: 14px; color: #4a5568; line-height: 1.7; margin: 0;">
            If you continue to experience issues, please contact our support team for assistance.
          </p>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 14px; color: #555; margin: 0 0 8px 0;">
            Best Regards,
          </p>
          <p style="font-size: 15px; color: #d32f2f; font-weight: 600; margin: 0 0 20px 0;">
            Crown & Pitch Team
          </p>
          <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
            © ${new Date().getFullYear()} Crown & Pitch. All rights reserved.
          </p>
        </div>
        
      </div>
    </div>`;
};

// Camp Refund Processed
const campRefundProcessedEmail = (
  parentName: string,
  refundType: string,
  refundAmount: number
) => {
  const refundTypeLabel =
    refundType === "CREDIT"
      ? "Full Credit"
      : refundType === "REFUND"
        ? "Cash Refund (minus $25 admin fee)"
        : "Full Refund";

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 40px 20px; background-color: #f4f6f9;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
        
        <div style="background: #ff9800; padding: 40px 30px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">
            Refund Processed
          </h1>
        </div>
        
        <div style="padding: 40px 30px;">
          <p style="font-size: 16px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Dear ${parentName},
          </p>
          
          <p style="font-size: 15px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            Your camp registration has been cancelled and a refund has been processed.
          </p>
          
          <div style="background-color: #fff3e0; padding: 25px; border-radius: 6px; margin: 0 0 25px 0; border-left: 4px solid #ff9800;">
            <h3 style="color: #e65100; margin: 0 0 15px 0; font-size: 16px;">Refund Details:</h3>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 15px; color: #4a5568; line-height: 2;">
              <li><strong>Refund Type:</strong> ${refundTypeLabel}</li>
              <li><strong>Refund Amount:</strong> $${refundAmount.toFixed(2)}</li>
              <li><strong>Processing Time:</strong> 3-5 business days</li>
            </ul>
          </div>
          
          <p style="font-size: 15px; color: #4a5568; line-height: 1.7; margin: 0 0 25px 0;">
            If you registered for a credit, it will be valid for any 2026 camp session. If you have any questions or concerns, please don't hesitate to contact us.
          </p>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="font-size: 14px; color: #555; margin: 0 0 8px 0;">
            Best Regards,
          </p>
          <p style="font-size: 15px; color: #ff9800; font-weight: 600; margin: 0 0 20px 0;">
            Crown & Pitch Team
          </p>
          <p style="font-size: 12px; color: #777; margin: 0; line-height: 1.6;">
            © ${new Date().getFullYear()} Crown & Pitch. All rights reserved.
          </p>
        </div>
        
      </div>
    </div>`;
};

export {
  generateOtpEmail,
  forgetPasswordEmail,
  resendOtpEmail,
  inviteUserEmail,
  generateSupportMessageEmail,
  waiverReminderEmailHtml,
  teamInvitationEmailHtml,
  waitlistOfferEmail,
  campRegistrationConfirmationEmail,
  campPaymentConfirmedEmail,
  campPaymentFailedEmail,
  campRefundProcessedEmail,
};