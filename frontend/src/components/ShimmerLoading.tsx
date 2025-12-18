import React from "react";

interface ShimmerLoadingProps {
  variant: "card" | "table";
  count?: number;
}

const ShimmerLoading: React.FC<ShimmerLoadingProps> = ({
  variant,
  count = 5,
}) => {
  if (variant === "card") {
    return (
      <div className="row">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="col-sm-6 col-md-4 col-lg-3 mb-4">
            <div className="card shimmer-card" style={{ height: "280px" }}>
              <div className="card-body">
                {/* Player name shimmer */}
                <div
                  className="shimmer-line"
                  style={{
                    width: "70%",
                    height: "24px",
                    marginBottom: "16px",
                  }}
                ></div>

                {/* Team and date shimmer */}
                <div
                  className="shimmer-line"
                  style={{
                    width: "85%",
                    height: "18px",
                    marginBottom: "12px",
                  }}
                ></div>

                {/* Score badge shimmer */}
                <div
                  className="shimmer-line"
                  style={{
                    width: "60px",
                    height: "32px",
                    marginBottom: "16px",
                    borderRadius: "16px",
                  }}
                ></div>

                {/* Details lines shimmer */}
                <div
                  className="shimmer-line"
                  style={{
                    width: "90%",
                    height: "16px",
                    marginBottom: "8px",
                  }}
                ></div>
                <div
                  className="shimmer-line"
                  style={{
                    width: "75%",
                    height: "16px",
                    marginBottom: "8px",
                  }}
                ></div>
                <div
                  className="shimmer-line"
                  style={{
                    width: "80%",
                    height: "16px",
                    marginBottom: "16px",
                  }}
                ></div>

                {/* Button shimmer */}
                <div
                  className="shimmer-line"
                  style={{
                    width: "100%",
                    height: "38px",
                    borderRadius: "4px",
                  }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Table variant - renders tbody rows only (no table wrapper or thead)
  // This is because it's used inside an existing table structure
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <tr key={index}>
          <td style={{ width: "30px" }}>
            <div
              className="shimmer-line"
              style={{ width: "8px", height: "8px", borderRadius: "50%" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "90px", height: "20px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "120px", height: "20px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "40px", height: "20px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "80px", height: "20px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "180px", height: "20px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "50px", height: "28px", borderRadius: "14px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "100px", height: "20px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "90px", height: "20px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "90px", height: "20px" }}
            ></div>
          </td>
          <td>
            <div
              className="shimmer-line"
              style={{ width: "100px", height: "32px", borderRadius: "4px" }}
            ></div>
          </td>
        </tr>
      ))}
    </>
  );
};

export default ShimmerLoading;
