import { Layout } from "@workspace/ui/components/landing1/layout";
import { ContactCard } from "@workspace/ui/components/landing1/contact-card";
import { header, footer, contactCard } from "@workspace/ui/components/landing1/default";

export default function ContactPage() {
  return (
    <Layout header={header} footer={footer}>
      <ContactCard {...contactCard} />
    </Layout>
  );
}
