import { Layout } from "@workspace/ui/components/landing1/layout";
import { PageIntro } from "@workspace/ui/components/landing1/page-intro";
import { SectionList } from "@workspace/ui/components/landing1/section-list";
import { header, footer } from "@workspace/ui/components/landing1/default";

export default function PrivacyPage() {
  return (
    <Layout header={header} footer={footer}>
      <PageIntro
        title="Privacy Policy"
        intro="This policy explains what information we collect, how we use it, and the choices you have."
        eyebrow="Updated 1 July 2026"
      />
      <div className="mx-auto max-w-3xl">
        <SectionList
          sections={[
            {
              heading: "Information we collect",
              body: "We collect account details you provide directly, along with basic usage data needed to operate the service.",
            },
            {
              heading: "How we use your information",
              body: [
                "We use your information to provide and improve the service.",
                "We never sell your personal data to third parties.",
              ],
            },
            {
              heading: "Your choices",
              body: "You can request access to, correction of, or deletion of your personal data at any time by contacting us.",
            },
          ]}
        />
      </div>
    </Layout>
  );
}
