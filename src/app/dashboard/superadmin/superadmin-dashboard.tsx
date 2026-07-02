'use client';
import { FeatureManager } from "./feature-manager";
import { GlobalCustomerManager } from "./global-customer-manager";
import { UserManager } from "./user-manager";
import ReportPage from "../report/page";

export default function SuperadminDashboard({ activeView }: { activeView: string }) {

  const renderContent = () => {
    switch (activeView) {
      case 'features':
        return <FeatureManager />;
      case 'users':
        return <UserManager />;
      case 'customers':
        return <GlobalCustomerManager />;
      case 'report':
        return <ReportPage />;
      default:
        return <FeatureManager />;
    }
  };

  return (
    <div className="w-full space-y-8">
      {renderContent()}
    </div>
  );
}
