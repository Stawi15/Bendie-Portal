type ComingSoonPanelProps = {
  icon: string;
  title: string;
  description: string;
};

export function ComingSoonPanel({ icon, title, description }: ComingSoonPanelProps) {
  return (
    <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow flex flex-col items-center text-center py-20 px-6">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
        <span className="material-symbols-outlined text-primary text-3xl">{icon}</span>
      </div>
      <h2 className="font-headline-md text-headline-md text-on-surface mb-2">{title}</h2>
      <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">{description}</p>
    </div>
  );
}
