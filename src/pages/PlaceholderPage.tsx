import TopBar from "@/components/dashboard/TopBar";

interface PlaceholderPageProps {
  title: string;
}

const PlaceholderPage = ({ title }: PlaceholderPageProps) => {
  return (
    <>
      <TopBar title={title} />
      <main className="flex-1 overflow-auto p-8">
        <div className="rounded-lg border border-border bg-card p-8">
          <h2 className="text-xl font-semibold text-card-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This section is under development.
          </p>
        </div>
      </main>
    </>
  );
};

export default PlaceholderPage;
