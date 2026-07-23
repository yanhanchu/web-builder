import { Layout } from "@workspace/ui/components/landing1/layout";
import { PageIntro } from "@workspace/ui/components/landing1/page-intro";
import { SectionList } from "@workspace/ui/components/landing1/section-list";
import { header, footer } from "@workspace/ui/components/landing1/default";

export default function TermsPage() {
  return (
    <Layout header={header} footer={footer}>
      <PageIntro
        title="Terms of Service"
        intro="These terms govern your use of our product. By using the service, you agree to the terms below."
        eyebrow="Updated 1 July 2026"
      />
      <div className="mx-auto max-w-3xl">
        <SectionList
          sections={[
            {
              heading: "Using our service",
              body: "You agree to use the service only for lawful purposes and in accordance with these terms.",
            },
            {
              heading: "Accounts",
              body: [
                "You're responsible for keeping your account credentials secure.",
                "You must notify us promptly of any unauthorized use of your account.",
              ],
            },
            {
              heading: "Changes to these terms",
              body: "We may update these terms from time to time. Continued use of the service means you accept the changes.",
            },
          ]}
        />
      </div>
    </Layout>
  );
}
