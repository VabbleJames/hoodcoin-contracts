@echo off
REM Deep Security Analysis Script for HoodCoin Contracts
REM ===================================================

echo === RUNNING COMPREHENSIVE SECURITY ANALYSIS ===
mkdir security-reports 2>nul

REM Set the path to your Slither executable
set SLITHER_PATH=C:\Users\JInfi\AppData\Roaming\Python\Python313\Scripts\slither.exe

echo.
echo [1/7] Running full Slither analysis on all contracts...
"%SLITHER_PATH%" . --detect all --json security-reports\slither-full.json > security-reports\slither-full.txt 2>&1
echo Analysis saved to security-reports\slither-full.txt

echo.
echo [2/7] Analyzing specific high-risk contracts...
"%SLITHER_PATH%" contracts/HoodCoinManager.sol --detect all --json security-reports\manager-analysis.json > security-reports\manager-analysis.txt 2>&1
echo Manager analysis saved to security-reports\manager-analysis.txt

"%SLITHER_PATH%" contracts/HoodCoinBondingMath.sol --detect all --json security-reports\bonding-analysis.json > security-reports\bonding-analysis.txt 2>&1
echo Bonding math analysis saved to security-reports\bonding-analysis.txt

echo.
echo [3/7] Running specialized Slither printers...
"%SLITHER_PATH%" . --print inheritance --json security-reports\inheritance.json > security-reports\inheritance.txt 2>&1
echo Inheritance analysis saved to security-reports\inheritance.txt

"%SLITHER_PATH%" . --print function-summary --json security-reports\function-summary.json > security-reports\function-summary.txt 2>&1
echo Function summary saved to security-reports\function-summary.txt

"%SLITHER_PATH%" . --print vars-and-auth --json security-reports\vars-and-auth.json > security-reports\vars-and-auth.txt 2>&1
echo Variables and authorization analysis saved to security-reports\vars-and-auth.txt

"%SLITHER_PATH%" . --print call-graph --json security-reports\call-graph.json > security-reports\call-graph.txt 2>&1
echo Call graph analysis saved to security-reports\call-graph.txt

echo.
echo [4/7] Running checks for reentrancy vulnerabilities...
"%SLITHER_PATH%" . --detect reentrancy-eth,reentrancy-no-eth,reentrancy-events --json security-reports\reentrancy.json > security-reports\reentrancy.txt 2>&1
echo Reentrancy analysis saved to security-reports\reentrancy.txt

echo.
echo [5/7] Checking for access control issues...
"%SLITHER_PATH%" . --detect missing-modifier,incorrect-modifier,protected-vars --json security-reports\access-control.json > security-reports\access-control.txt 2>&1
echo Access control analysis saved to security-reports\access-control.txt

echo.
echo [6/7] Analyzing contract dependencies and interface conformance...
"%SLITHER_PATH%" . --detect external-function,naming-convention,unused-state,solc-version,pragma,uninitialized-storage --json security-reports\conventions.json > security-reports\conventions.txt 2>&1
echo Conventions analysis saved to security-reports\conventions.txt

echo.
echo [7/7] Running specialized check for mathematical vulnerabilities...
"%SLITHER_PATH%" . --detect divide-before-multiply,timestamp,constable-states --json security-reports\math.json > security-reports\math.txt 2>&1
echo Math analysis saved to security-reports\math.txt

echo.
echo === ANALYSIS COMPLETE ===
echo All reports saved to security-reports directory
echo.
echo Summary:
type security-reports\slither-full.txt | findstr "high" | find /c ":" > security-reports\high.txt
echo High severity issues: 
type security-reports\high.txt

type security-reports\slither-full.txt | findstr "medium" | find /c ":" > security-reports\medium.txt
echo Medium severity issues: 
type security-reports\medium.txt

type security-reports\slither-full.txt | findstr "low" | find /c ":" > security-reports\low.txt
echo Low severity issues: 
type security-reports\low.txt

echo.
echo Please review all reports in the security-reports directory for complete details