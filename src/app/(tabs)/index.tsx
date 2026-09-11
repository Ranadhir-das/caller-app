import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDialerSession } from '@/context/DialerSessionContext';
import { useLeads } from '@/context/LeadContext';

export default function HomeScreen() {
  const { leads, callHistory, getUpcomingFollowUps, getOverdueFollowUps } = useLeads();
  const recentActivity = callHistory
    .slice()
    .sort(
      (a, b) =>
        new Date(b.calledAt).getTime() -
        new Date(a.calledAt).getTime()
    )
    .slice(0, 5);

  const { session, startSession } = useDialerSession();
  const upcomingFollowUps =
    getUpcomingFollowUps();
  
  const overdueFollowUps =
    getOverdueFollowUps();

  const allFollowUps = [
    ...overdueFollowUps,
    ...upcomingFollowUps,
  ];

  const {
    callsAttempted,
    interested,
    notInterested,
    noAnswer,
    busy,
    callBack,
    wrongNumber,
    skipped,
  } = session.stats;

  const completedCalls = leads.filter(
    (lead) => lead.status !== 'pending'
  ).length;
  
  const followUps = leads.filter(
    (lead) => lead.status === 'call_back'
  ).length;

  const totalStudents = leads.length;

  const todayCalls = callHistory.filter((call) => {
    const callDate = new Date(call.calledAt);
    const today = new Date();
  
    return callDate.toDateString() === today.toDateString();
  }).length;
  
  const progress =
    totalStudents > 0
      ? Math.min(todayCalls / totalStudents, 1)
      : 0;
  
  const remainingStudents = Math.max(
    totalStudents - todayCalls,
    0
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning 👋</Text>
          <Text style={styles.title}>Caller Dashboard</Text>
        </View>

        <View style={styles.profileCircle}>
          <Text style={styles.profileText}>C</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {callHistory.filter((call) => {
            const callDate = new Date(call.calledAt);
            const today = new Date();
          
            return callDate.toDateString() === today.toDateString();
          }).length}
          </Text>
          <Text style={styles.statLabel}>Today's Calls</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedCalls}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{followUps}</Text>
          <Text style={styles.statLabel}>Follow-ups</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <Pressable
          style={styles.startButton}
          onPress={() => {
            const nextStudent = leads.find(
              (lead) => lead.status === 'pending'
            );
          
            if (!nextStudent) {
              Alert.alert(
                'No Students Pending',
                'All students have already been processed.'
              );
          
              return;
            }
          
            // Start a completely new session.
            startSession();
          
            router.push({
              pathname: '/dialer',
              params: {
                id: nextStudent.id,
              },
            });
          }}
        >
          <Text style={styles.startButtonText}>
            Start Dialer
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Progress</Text>
      
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              {todayCalls} / {totalStudents} calls completed
            </Text>
      
            <Text style={styles.progressPercentage}>
              {Math.round(progress * 100)}%
            </Text>
          </View>
      
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                },
              ]}
            />
          </View>
      
          <Text style={styles.remainingText}>
            {remainingStudents === 0
              ? 'All students completed'
              : `${remainingStudents} students remaining`}
          </Text>
        </View>
      </View>

      {/* ------------------------------------------ */}
      {/* FOLLOW-UPS */}
      {/* ------------------------------------------ */}

      <View style={styles.section}>
        <View style={styles.followUpHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Follow-ups
            </Text>

            <Text style={styles.followUpSubtitle}>
              {allFollowUps.length === 0
                ? 'No follow-ups scheduled'
                : `${allFollowUps.length} follow-up${
                    allFollowUps.length === 1
                      ? ''
                      : 's'
                  }`}
            </Text>
          </View>

          {overdueFollowUps.length > 0 && (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueBadgeText}>
                {overdueFollowUps.length} Overdue
              </Text>
            </View>
          )}
        </View>

        {allFollowUps.length === 0 ? (
          <View style={styles.noFollowUpCard}>
            <Text style={styles.noFollowUpIcon}>
              📅
            </Text>

            <Text style={styles.noFollowUpTitle}>
              No follow-ups
            </Text>

            <Text style={styles.noFollowUpText}>
              Students scheduled for a call back
              will appear here.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              styles.followUpList
            }
          >
            {allFollowUps.map((lead) => {
              const isOverdue =
                overdueFollowUps.some(
                  (item) => item.id === lead.id
                );

              const followUpDate =
                lead.followUpDate
                  ? new Date(
                      lead.followUpDate
                    )
                  : null;

              const formattedDate =
                followUpDate
                  ? followUpDate.toLocaleDateString(
                      'en-IN',
                      {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      }
                    )
                  : '';

              return (
                <Pressable
                  key={lead.id}
                  style={styles.followUpCard}
                  onPress={() => {
                    router.push({
                      pathname: '/follow-up-details',
                      params: {
                        id: lead.id,
                      },
                    });
                  }}
                >
                  <View
                    style={
                      styles.followUpTopRow
                    }
                  >
                    <View
                      style={
                        styles.followUpAvatar
                      }
                    >
                      <Text
                        style={
                          styles.followUpAvatarText
                        }
                      >
                        {lead.name
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.followUpStudentInfo
                      }
                    >
                      <Text
                        style={
                          styles.followUpStudentName
                        }
                        numberOfLines={1}
                      >
                        {lead.name}
                      </Text>

                      <Text
                        style={
                          styles.followUpPhone
                        }
                      >
                        {lead.phone}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.followUpDateBox,
                      isOverdue &&
                        styles.overdueDateBox,
                    ]}
                  >
                    <Text
                      style={
                        styles.followUpDateIcon
                      }
                    >
                      📅
                    </Text>

                    <View>
                      <Text
                        style={[
                          styles.followUpDateLabel,
                          isOverdue &&
                            styles.overdueDateLabel,
                        ]}
                      >
                        {isOverdue
                          ? 'Overdue'
                          : 'Follow-up'}
                      </Text>

                      <Text
                        style={[
                          styles.followUpDateText,
                          isOverdue &&
                            styles.overdueDateText,
                        ]}
                      >
                        {formattedDate}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={styles.followUpCallButton}
                    onPress={(event) => {
                      event.stopPropagation();

                      router.push({
                        pathname:
                          '/dialer',
                        params: {
                          id: lead.id,
                        },
                      });
                    }}
                  >
                    <Text
                      style={
                        styles.followUpCallButtonText
                      }
                    >
                      📞 Call Student
                    </Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ------------------------------------------ */}
      {/* RECENT-CALLS */}
      {/* ------------------------------------------ */}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Recent Activity
            </Text>
      
            <Text style={styles.sectionSubtitle}>
              Your latest calls
            </Text>
          </View>
      
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/history')}
          >
            <Text style={styles.viewAllText}>
              View All
            </Text>
          </TouchableOpacity>
        </View>
      
        {recentActivity.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>
              No recent activity
            </Text>
      
            <Text style={styles.emptyCardText}>
              Your recent calls will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.activityList}>
            {recentActivity.map((call) => (
              <TouchableOpacity
                key={call.id}
                style={styles.activityCard}
                activeOpacity={0.8}
                onPress={() =>
                  router.push({
                    pathname: '/call-history-details',
                    params: {
                      id: call.id,
                    },
                  })
                }
              >
                <View style={styles.activityAvatar}>
                  <Text style={styles.activityAvatarText}>
                    {call.leadName
                      .split(' ')
                      .map((word) => word[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
      
                <View style={styles.activityContent}>
                  <Text
                    style={styles.activityName}
                    numberOfLines={1}
                  >
                    {call.leadName}
                  </Text>
      
                  <Text style={styles.activityPhone}>
                    {call.phone}
                  </Text>
      
                  <Text style={styles.activityTime}>
                    {new Date(call.calledAt).toLocaleString()}
                  </Text>
                </View>
      
                <View style={styles.activityRight}>
                  <View
                    style={[
                      styles.outcomeBadge,
                      {
                        backgroundColor:
                          call.outcome === 'interested'
                            ? '#DCFCE7'
                            : call.outcome === 'not_interested'
                            ? '#FEE2E2'
                            : call.outcome === 'call_back'
                            ? '#FEF3C7'
                            : '#E5E7EB',
                      },
                    ]}
                  >
                    <Text style={styles.outcomeBadgeText}>
                      {call.outcome === 'interested'
                        ? 'Interested'
                        : call.outcome === 'not_interested'
                        ? 'Not Interested'
                        : call.outcome === 'no_answer'
                        ? 'No Answer'
                        : call.outcome === 'busy'
                        ? 'Busy'
                        : call.outcome === 'call_back'
                        ? 'Call Back'
                        : call.outcome === 'wrong_number'
                        ? 'Wrong Number'
                        : call.outcome}
                    </Text>
                  </View>
      
                  <Text style={styles.chevron}>
                    ›
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sessionHeader}>
          <Text style={styles.sectionTitle}>
            Dialer Session
          </Text>
      
          <View
            style={[
              styles.sessionStatus,
              session.status === 'active'
                ? styles.sessionActive
                : session.status === 'paused'
                ? styles.sessionPaused
                : styles.sessionStopped,
            ]}
          >
            <Text style={styles.sessionStatusText}>
              {session.status === 'active'
                ? 'Active'
                : session.status === 'paused'
                ? 'Paused'
                : session.status === 'stopped'
                ? 'Stopped'
                : 'Not Started'}
            </Text>
          </View>
        </View>
      
        <View style={styles.sessionCard}>
          <View style={styles.sessionMainStat}>
            <Text style={styles.sessionMainNumber}>
              {callsAttempted}
            </Text>
      
            <Text style={styles.sessionMainLabel}>
              Calls Attempted
            </Text>
          </View>
      
          <View style={styles.sessionGrid}>
            <View style={styles.sessionStat}>
              <Text style={styles.sessionStatNumber}>
                {interested}
              </Text>
              <Text style={styles.sessionStatLabel}>
                Interested
              </Text>
            </View>
      
            <View style={styles.sessionStat}>
              <Text style={styles.sessionStatNumber}>
                {notInterested}
              </Text>
              <Text style={styles.sessionStatLabel}>
                Not Interested
              </Text>
            </View>
      
            <View style={styles.sessionStat}>
              <Text style={styles.sessionStatNumber}>
                {noAnswer}
              </Text>
              <Text style={styles.sessionStatLabel}>
                No Answer
              </Text>
            </View>
      
            <View style={styles.sessionStat}>
              <Text style={styles.sessionStatNumber}>
                {busy}
              </Text>
              <Text style={styles.sessionStatLabel}>
                Busy
              </Text>
            </View>
      
            <View style={styles.sessionStat}>
              <Text style={styles.sessionStatNumber}>
                {callBack}
              </Text>
              <Text style={styles.sessionStatLabel}>
                Call Back
              </Text>
            </View>
      
            <View style={styles.sessionStat}>
              <Text style={styles.sessionStatNumber}>
                {wrongNumber}
              </Text>
              <Text style={styles.sessionStatLabel}>
                Wrong Number
              </Text>
            </View>
      
            <View style={styles.sessionStat}>
              <Text style={styles.sessionStatNumber}>
                {skipped}
              </Text>
              <Text style={styles.sessionStatLabel}>
                Skipped
              </Text>
            </View>
          </View>
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },

  greeting: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },

  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  statsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },

  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 5,
  },

  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },

  section: {
    marginBottom: 26,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },

  startButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 12,
  },

  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },

  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
  },

  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },

  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
  },

  progressTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },

  progressSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6B7280',
  },
  progressHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
},

progressBar: {
  width: '100%',
  height: 10,
  borderRadius: 5,
  backgroundColor: '#E5E7EB',
  overflow: 'hidden',
},

progressFill: {
  height: '100%',
  borderRadius: 5,
  backgroundColor: '#2563EB',
},

progressPercentage: {
  fontSize: 16,
  fontWeight: '700',
},

remainingText: {
  marginTop: 10,
  fontSize: 13,
  opacity: 0.6,
},

sessionHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
},

sessionStatus: {
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 20,
  marginBottom: 12,
},

sessionActive: {
  backgroundColor: '#DCFCE7',
},

sessionPaused: {
  backgroundColor: '#FEF3C7',
},

sessionStopped: {
  backgroundColor: '#FEE2E2',
},

sessionStatusText: {
  fontSize: 11,
  fontWeight: '700',
  color: '#374151',
},

sessionCard: {
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  padding: 18,
},

sessionMainStat: {
  alignItems: 'center',
  paddingBottom: 16,
  borderBottomWidth: 1,
  borderBottomColor: '#F0F0F0',
},

sessionMainNumber: {
  fontSize: 32,
  fontWeight: '800',
  color: '#2563EB',
},

sessionMainLabel: {
  marginTop: 3,
  fontSize: 13,
  color: '#6B7280',
},

sessionGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  marginTop: 14,
},

sessionStat: {
  width: '33.33%',
  alignItems: 'center',
  marginBottom: 15,
},

sessionStatNumber: {
  fontSize: 19,
  fontWeight: '700',
  color: '#111827',
},

sessionStatLabel: {
  fontSize: 10,
  color: '#6B7280',
  textAlign: 'center',
  marginTop: 3,
},

  // ------------------------------------------
  // FOLLOW-UP STYLES
  // ------------------------------------------

  followUpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  followUpSubtitle: {
    marginTop: -6,
    marginBottom: 12,
    fontSize: 12,
    color: '#6B7280',
  },

  overdueBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  overdueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
  },

  followUpList: {
    paddingRight: 10,
  },

  followUpCard: {
    width: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
  },

  followUpTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  followUpAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  followUpAvatarText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2563EB',
  },

  followUpStudentInfo: {
    flex: 1,
    marginLeft: 12,
  },

  followUpStudentName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  followUpPhone: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },

  followUpDateBox: {
    marginTop: 14,
    padding: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  overdueDateBox: {
    backgroundColor: '#FEF2F2',
  },

  followUpDateIcon: {
    fontSize: 18,
    marginRight: 9,
  },

  followUpDateLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1D4ED8',
  },

  overdueDateLabel: {
    color: '#B91C1C',
  },

  followUpDateText: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },

  overdueDateText: {
    color: '#DC2626',
  },

  followUpCallButton: {
    marginTop: 12,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },

  followUpCallButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  noFollowUpCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },

  noFollowUpIcon: {
    fontSize: 32,
    marginBottom: 8,
  },

  noFollowUpTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  noFollowUpText: {
    marginTop: 5,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },

sectionHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 12,
},

sectionSubtitle: {
  marginTop: 3,
  fontSize: 13,
  opacity: 0.6,
},

viewAllText: {
  fontSize: 14,
  fontWeight: '600',
},

emptyCard: {
  padding: 20,
  borderRadius: 16,
  alignItems: 'center',
  backgroundColor: '#F3F4F6',
},

emptyCardTitle: {
  fontSize: 15,
  fontWeight: '600',
},

emptyCardText: {
  marginTop: 5,
  fontSize: 13,
  opacity: 0.6,
},

activityList: {
  gap: 10,
},

activityCard: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 14,
  borderRadius: 16,
  backgroundColor: '#F8FAFC',
},

activityAvatar: {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#E5E7EB',
},

activityAvatarText: {
  fontSize: 13,
  fontWeight: '700',
},

activityContent: {
  flex: 1,
  marginLeft: 12,
},

activityName: {
  fontSize: 15,
  fontWeight: '700',
},

activityPhone: {
  marginTop: 2,
  fontSize: 12,
  opacity: 0.6,
},

activityTime: {
  marginTop: 3,
  fontSize: 11,
  opacity: 0.5,
},

activityRight: {
  alignItems: 'flex-end',
  marginLeft: 8,
},

outcomeBadge: {
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 8,
},

outcomeBadgeText: {
  fontSize: 10,
  fontWeight: '700',
},

chevron: {
  marginTop: 4,
  fontSize: 22,
  opacity: 0.4,
},
scrollContent: {
  paddingBottom: 32,
},

progressText: {
  fontSize: 14,
  fontWeight: '600',
},
});