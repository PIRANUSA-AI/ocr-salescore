
'use client';

import AnalysisView from './views/analysis-view';
import TasksView from './views/tasks-view';
import SalesAssistantView from './views/sales-assistant-view';
import CustomerManagementView from './views/customer-management-view';
import DealsView from './views/deals-view';
import ReportPage from '../report/page';
import MediaLibraryView from './views/media-library-view';
import CompanyView from './views/company-view';
import EmailBlastView from './views/email-blast-view';
// import TodoView from './views/todo-view'; // Task-to-Do (MySQL) dinonaktifkan — fully Firebase


interface LeaderDashboardContentProps {
  activeView: string;
}

// This component now only renders the view based on the prop passed from the main dashboard page.
function LeaderDashboardContent({ activeView }: LeaderDashboardContentProps) {

  const renderContent = () => {
    switch (activeView) {
      case 'analysis':
        return <AnalysisView />;
      case 'tugas':
        return <TasksView />;
      case 'sales-assistant':
        return <SalesAssistantView />;
      case 'customer-manager':
        return <CustomerManagementView />;
      case 'company':
        return <CompanyView />;
      case 'deals':
        return <DealsView />;
      case 'report':
        return <ReportPage />;
      case 'media-library':
        return <MediaLibraryView />;
      case 'email-blast':
        return <EmailBlastView />;
      case 'to-do':
        // Task-to-Do (MySQL) dinonaktifkan — fully Firebase. Fallback ke default.
        // return <TodoView />;
        return <CustomerManagementView />;
      default:
        // Default to analysis view if the activeView is unknown
        return <CustomerManagementView />;
    }
  };

  return (
    <>
      {/* The CustomerEditDialog is now rendered inside the views that use it */}
      {renderContent()}
    </>
  );
}


export default function LeaderDashboardPage({ activeView }: { activeView: string }) {
  return (
    <LeaderDashboardContent activeView={activeView} />
  )
}
