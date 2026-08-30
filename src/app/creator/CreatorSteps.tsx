const labels = ['Tożsamość', 'Profil', 'Wybór zawodnika'];
export const CreatorSteps = ({ step }: { step: number }) => (
  <ol className="creator-steps" aria-label="Postęp kreatora">
    {labels.map((label, index) => (
      <li
        aria-current={index === step ? 'step' : undefined}
        className={index < step ? 'complete' : ''}
        key={label}
      >
        <span>{index + 1}</span>
        {label}
      </li>
    ))}
  </ol>
);
