/** PR145 significance boundaries, in metres/seconds. These describe football commitments,
 * not a prompt-count budget. Ordinary body/line adjustments stay with canonical autonomy. */
export const PLAYER_AGENCY_CALIBRATION = Object.freeze({
  interceptionTeammateEtaLead: 0.25,
  interceptionLaneContactRadius: 1.05,
  interceptionEarlierContactLead: 0.15,
  minimumInterceptionCommitment: 2.5,
  significantShapeDeparture: 4.5,
  dangerousGoalDistance: 34,
  protectedRunnerDistance: 12,
  challengeContactDistance: 2.4,
  carryChallengeLaneRadius: 1.5,
  carryChallengeDistance: 4,
  meaningfulReceptionPressureDistance: 2.4,
  // A long switch into safe space is circulation; close control under a press is a commitment.
  meaningfulLongReceptionProgress: 65,
});
